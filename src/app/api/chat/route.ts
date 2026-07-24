import { NextRequest } from "next/server";
import { withAuth } from "@/lib/middleware";
import { db } from "@/db";
import { messages, conversations, models, modelConfigs, personas, usageLogs, settings } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { createLLMClient } from "@/lib/llm-client";
import { apiBadRequest } from "@/lib/api-helpers";
import { getActiveSearchConfig, getSearchProvider, type SearchProvider, type SearchResult } from "@/lib/search";
import { runToolPhase, buildForcedContext } from "@/lib/search/tool-phase";
import { readUploadAsBase64DataUrl, readUploadAsText } from "@/lib/storage";
import type OpenAI from "openai";

type TokenUsage = { prompt: number; completion: number; total: number; cost?: number };
type Model = typeof models.$inferSelect;
type ModelConfig = typeof modelConfigs.$inferSelect;
type ChatMessage = OpenAI.Chat.ChatCompletionMessageParam;
type Attachment = { type: string; url: string; name: string; size: number };

// ---- 附件 → 多模态内容构建 ----

async function buildMessageContent(
  textContent: string,
  attachments: Attachment[] | null | undefined,
  hasVision: boolean,
  ocrDescriptions?: Map<string, string>,
): Promise<string | Array<OpenAI.Chat.ChatCompletionContentPart>> {
  if (!attachments?.length) return textContent;

  const parts: Array<OpenAI.Chat.ChatCompletionContentPart> = [];

  // 文本文件内容注入上下文
  for (const att of attachments) {
    if (att.type === "text") {
      const fileContent = await readUploadAsText(att.url);
      if (fileContent) {
        parts.push({ type: "text", text: `[文件: ${att.name}]\n${fileContent}` });
      }
    }
  }

  // 用户消息正文
  parts.push({ type: "text", text: textContent });

  // 图片附件
  for (const att of attachments) {
    if (att.type === "image") {
      if (hasVision) {
        // 模型支持 Vision：直接发送 base64 图片
        const dataUrl = await readUploadAsBase64DataUrl(att.url);
        if (dataUrl) {
          parts.push({ type: "image_url", image_url: { url: dataUrl } });
        }
      } else {
        // 模型不支持 Vision：注入 OCR 描述
        const desc = ocrDescriptions?.get(att.url);
        if (desc) {
          parts.push({ type: "text", text: `[图片识别结果: ${att.name}]\n${desc}` });
        }
      }
    }
  }

  // 如果最终只有一个 text part 且无图片，退化为纯字符串
  if (parts.length === 1 && parts[0].type === "text") {
    return parts[0].text;
  }

  return parts;
}

/**
 * 使用 OCR 模型识别图片内容，返回 Map<url, description>。
 */
async function runOcrForImages(
  attachments: Attachment[],
): Promise<{ descriptions: Map<string, string>; warning?: string }> {
  const imageAtts = attachments.filter((a) => a.type === "image");
  if (imageAtts.length === 0) return { descriptions: new Map() };

  // 读取 OCR 模型设置
  const [ocrSetting] = await db.select().from(settings).where(eq(settings.key, "ocr_model_id"));
  const ocrModelId = ocrSetting?.value;

  if (!ocrModelId) {
    return {
      descriptions: new Map(),
      warning: "当前模型不支持识图，且未设置 OCR 模型。请前往「设置 → 通用」配置 OCR 模型，或为当前模型勾选识图能力。",
    };
  }

  const [ocrModel] = await db.select().from(models).where(eq(models.id, ocrModelId));
  if (!ocrModel) {
    return { descriptions: new Map(), warning: "OCR 模型不存在，请重新配置。" };
  }

  const [ocrConfig] = await db.select().from(modelConfigs).where(eq(modelConfigs.id, ocrModel.modelConfigId));
  if (!ocrConfig) {
    return { descriptions: new Map(), warning: "OCR 模型的服务商配置不存在。" };
  }

  const ocrClient = await createLLMClient(ocrConfig);
  const descriptions = new Map<string, string>();

  for (const att of imageAtts) {
    const dataUrl = await readUploadAsBase64DataUrl(att.url);
    if (!dataUrl) continue;

    try {
      const response = await ocrClient.chat.completions.create({
        model: ocrModel.modelId,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "请详细描述这张图片的内容，包括文字、图表、布局等所有可见信息。" },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        max_tokens: 1000,
      });

      const desc = response.choices[0]?.message?.content;
      if (desc) descriptions.set(att.url, desc);
    } catch {
      // 单张图片 OCR 失败不中断整体流程
    }
  }

  return { descriptions };
}

function estimateTokens(content: string | Array<OpenAI.Chat.ChatCompletionContentPart>): number {
  if (typeof content === "string") {
    return Math.ceil(content.length / 4);
  }
  let total = 0;
  for (const part of content) {
    if (part.type === "text") {
      total += Math.ceil(part.text.length / 4);
    } else if (part.type === "image_url") {
      total += 800; // 图片固定估值
    }
  }
  return total;
}

async function attemptStream(
  streamClient: OpenAI,
  streamModelName: string,
  openaiMessages: ChatMessage[],
  assistantMessageId: string,
  encoder: TextEncoder,
  controller: ReadableStreamDefaultController,
  contentRef: { value: string },
  extraParams: Record<string, unknown> = {},
  nativeProvider?: SearchProvider,
  citationsRef?: { value: SearchResult[] },
): Promise<{ usage: TokenUsage | null; success: boolean; retryable: boolean; error?: string }> {
  let usage: TokenUsage | null = null;
  try {
    const response = await streamClient.chat.completions.create({
      model: streamModelName,
      messages: openaiMessages,
      stream: true,
      stream_options: { include_usage: true },
      ...extraParams,
    });

    for await (const chunk of response) {
      const delta = chunk.choices[0]?.delta?.content || "";
      if (delta) {
        contentRef.value += delta;
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ content: delta, messageId: assistantMessageId })}\n\n`)
        );
      }

      // 原生搜索：从 chunk 上捕获非标准的引用来源字段
      if (nativeProvider?.parseCitations && citationsRef) {
        const parsed = nativeProvider.parseCitations(chunk);
        if (parsed.length > 0) citationsRef.value = parsed;
      }

      if (chunk.usage) {
        usage = {
          prompt: chunk.usage.prompt_tokens,
          completion: chunk.usage.completion_tokens,
          total: chunk.usage.total_tokens,
        };
      }
    }

    return { usage, success: true, retryable: false };
  } catch (error: unknown) {
    const status = (error as { status?: number }).status;
    const code = (error as { code?: string }).code;
    const retryable = status === 429 || status === 503 || code === "ETIMEDOUT" || code === "ECONNABORTED";
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { usage: null, success: false, retryable, error: errorMessage };
  }
}

export const POST = withAuth(async (req: NextRequest) => {
  const { conversationId, content, modelId, attachments } = await req.json() as {
    conversationId?: string;
    content?: string;
    modelId?: string;
    attachments?: Attachment[];
  };

  if (!conversationId || !content) {
    return apiBadRequest("conversationId and content are required");
  }

  let client: OpenAI;
  let modelName: string;
  let model: Model | null = null;
  let config: ModelConfig | null = null;

  if (modelId) {
    const [foundModel] = await db.select().from(models).where(eq(models.id, modelId));
    if (!foundModel) {
      return apiBadRequest("Model not found");
    }
    model = foundModel;

    const [foundConfig] = await db.select().from(modelConfigs).where(eq(modelConfigs.id, foundModel.modelConfigId));
    if (!foundConfig) {
      return apiBadRequest("Model config not found");
    }
    config = foundConfig;
    client = await createLLMClient(foundConfig);
    modelName = foundModel.modelId;
  } else {
    return apiBadRequest("Please select a model from Settings before chatting");
  }

  const [conversation] = await db.select().from(conversations).where(eq(conversations.id, conversationId));

  if (!conversation) {
    return apiBadRequest("Conversation not found");
  }

  let systemPrompt: string | null = null;
  if (conversation?.personaId) {
    const [persona] = await db.select().from(personas).where(eq(personas.id, conversation.personaId));
    if (persona) {
      systemPrompt = persona.systemPrompt;
    }
  }

  const userMessageId = nanoid();
  await db.insert(messages).values({
    id: userMessageId,
    conversationId,
    role: "user",
    content,
    attachments: attachments?.length ? attachments : null,
    modelId: modelId || null,
    status: "success",
  });

  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));

  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));

  // ---- OCR 预处理（当模型不支持 Vision 时） ----
  const hasVision = Boolean(model?.capabilities?.vision);
  const allAttachments = history.flatMap((m) => (m.attachments as Attachment[]) || []);
  const hasImageAttachments = allAttachments.some((a) => a.type === "image");

  let ocrDescriptions: Map<string, string> | undefined;
  let ocrWarning: string | undefined;

  if (!hasVision && hasImageAttachments) {
    const ocrResult = await runOcrForImages(allAttachments);
    ocrDescriptions = ocrResult.descriptions;
    ocrWarning = ocrResult.warning;
  }

  // ---- 构建 openaiMessages ----
  let openaiMessages: ChatMessage[] = [];

  if (systemPrompt) {
    openaiMessages.push({ role: "system", content: systemPrompt });
  }

  for (const m of history) {
    const msgContent = await buildMessageContent(
      m.content,
      m.attachments as Attachment[] | null,
      hasVision,
      ocrDescriptions,
    );
    openaiMessages.push({
      role: m.role as "user" | "assistant" | "system",
      content: msgContent as string,
    });
  }

  if (model?.contextWindow) {
    const maxTokens = model.contextWindow;
    let totalTokens = 0;
    const systemMsg = systemPrompt ? [openaiMessages[0]] : [];
    const chatMsgs = systemPrompt ? openaiMessages.slice(1) : [...openaiMessages];

    for (const msg of systemMsg) {
      totalTokens += estimateTokens(msg.content as string);
    }

    const kept: typeof chatMsgs = [];
    for (let i = chatMsgs.length - 1; i >= 0; i--) {
      const estimated = estimateTokens(chatMsgs[i].content as string | Array<OpenAI.Chat.ChatCompletionContentPart>);
      if (totalTokens + estimated > maxTokens * 0.9) break;
      totalTokens += estimated;
      kept.unshift(chatMsgs[i]);
    }

    openaiMessages = [...systemMsg, ...kept];
  }

  const assistantMessageId = nanoid();
  const encoder = new TextEncoder();
  const contentRef = { value: "" };
  const startTime = Date.now();
  const searchMode = conversation.searchMode || "off";

  const stream = new ReadableStream({
    async start(controller) {
      let extraParams: Record<string, unknown> = {};
      let nativeProvider: SearchProvider | undefined;
      const citationsRef = { value: [] as SearchResult[] };
      let searchUsage: TokenUsage | null = null;
      let directAnswered = false;

      // ---- OCR 警告 ----
      if (ocrWarning) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ warning: ocrWarning })}\n\n`));
      }

      // ---- 联网搜索阶段 ----
      if (searchMode !== "off") {
        try {
          const searchConfig = await getActiveSearchConfig();
          if (searchConfig) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: "searching" })}\n\n`));
            const provider = await getSearchProvider(searchConfig);

            if (provider.kind === "native") {
              extraParams = provider.buildNativeParams?.() || {};
              nativeProvider = provider;
            } else if (searchMode === "forced" || !model?.capabilities?.tools) {
              // 强制模式，或模型不支持工具调用时退化为「先检索再作答」
              const results = await provider.search(content).catch(() => [] as SearchResult[]);
              citationsRef.value = results;
              const ctx = buildForcedContext(results);
              if (ctx) openaiMessages.push({ role: "system", content: ctx });
            } else {
              // auto 模式 + 支持工具的模型：两阶段
              const toolResult = await runToolPhase(client, modelName, openaiMessages, provider);
              searchUsage = toolResult.usage;
              if (toolResult.citations.length > 0) {
                citationsRef.value = toolResult.citations;
                openaiMessages = toolResult.augmentedMessages;
              } else if (toolResult.directAnswer !== undefined) {
                // 模型未检索，直接采用其答案
                directAnswered = true;
                contentRef.value = toolResult.directAnswer;
                if (contentRef.value) {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ content: contentRef.value, messageId: assistantMessageId })}\n\n`)
                  );
                }
              }
            }
          }
        } catch {
          // 搜索失败静默降级为普通聊天
        }
      }

      // ---- 生成阶段 ----
      let result: { usage: TokenUsage | null; success: boolean; retryable: boolean; error?: string };

      if (directAnswered) {
        result = { usage: searchUsage, success: true, retryable: false };
      } else {
        result = await attemptStream(
          client, modelName, openaiMessages, assistantMessageId, encoder, controller, contentRef,
          extraParams, nativeProvider, citationsRef
        );

        if (!result.success && result.retryable && config && contentRef.value === "") {
          const fallbackModels = await db.select().from(models).where(eq(models.modelConfigId, config.id));
          const fallback = fallbackModels.find((m) => m.enabled && m.id !== model?.id);
          if (fallback) {
            result = await attemptStream(
              client, fallback.modelId, openaiMessages, assistantMessageId, encoder, controller, contentRef,
              extraParams, nativeProvider, citationsRef
            );
          }
        }
      }

      const latencyMs = Date.now() - startTime;
      const citations = citationsRef.value.length > 0 ? citationsRef.value.map((c) => ({ title: c.title, url: c.url, snippet: c.snippet })) : null;

      if (result.success) {
        // 合并两阶段用量
        const streamUsage = result.usage;
        const combined: TokenUsage | null = streamUsage || searchUsage
          ? {
              prompt: (streamUsage?.prompt || 0) + (searchUsage?.prompt || 0),
              completion: (streamUsage?.completion || 0) + (searchUsage?.completion || 0),
              total: (streamUsage?.total || 0) + (searchUsage?.total || 0),
            }
          : null;

        let cost: number | undefined;
        if (combined && model?.pricing) {
          const pricing = model.pricing as { inputPer1k?: number; outputPer1k?: number };
          cost = ((pricing.inputPer1k || 0) * combined.prompt + (pricing.outputPer1k || 0) * combined.completion) / 1000;
        }

        const storedUsage = combined ? { ...combined, ...(cost !== undefined ? { cost } : {}) } : null;

        await db.insert(messages).values({
          id: assistantMessageId,
          conversationId,
          role: "assistant",
          content: contentRef.value,
          modelId: modelId || null,
          tokenUsage: storedUsage,
          searchResults: citations,
          latencyMs,
          status: "success",
        });

        if (combined) {
          await db.insert(usageLogs).values({
            id: nanoid(),
            modelId: modelId || null,
            provider: config?.provider || null,
            tokensIn: combined.prompt,
            tokensOut: combined.completion,
            cost: cost || 0,
            requestType: citations ? "search" : "chat",
          });
        }

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ done: true, messageId: assistantMessageId, usage: combined, searchResults: citations })}\n\n`)
        );
      } else {
        if (contentRef.value) {
          await db.insert(messages).values({
            id: assistantMessageId,
            conversationId,
            role: "assistant",
            content: contentRef.value,
            modelId: modelId || null,
            latencyMs,
            status: "error",
          });
        }
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: result.error || "Unknown error" })}\n\n`)
        );
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});
