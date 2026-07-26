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
import { getImageDataUrl, getTextContent } from "@/lib/attachment-cache";
import type OpenAI from "openai";

type TokenUsage = { prompt: number; completion: number; total: number; cost?: number };
type Model = typeof models.$inferSelect;
type ModelConfig = typeof modelConfigs.$inferSelect;
type ChatMessage = OpenAI.Chat.ChatCompletionMessageParam;
type StoredMessage = typeof messages.$inferSelect;

/** `ocrText` 为 OCR 识别结果的持久化缓存，避免每轮对话重复调用 OCR 模型。 */
type Attachment = {
  type: string;
  url: string;
  name: string;
  size: number;
  ocrText?: string;
};

const MAX_INPUT_LENGTH = 200_000;
const CONTEXT_BUDGET_RATIO = 0.9;
/** 未持久化 OCR 结果时，为一张图预留的估算 token 数 */
const IMAGE_TOKEN_ESTIMATE = 800;
const PENDING_OCR_TOKEN_ESTIMATE = 300;

function attachmentsOf(message: StoredMessage): Attachment[] {
  return (message.attachments as Attachment[] | null) ?? [];
}

// ---- 附件 → 多模态内容构建 ----

async function buildMessageContent(
  textContent: string,
  attachments: Attachment[],
  hasVision: boolean,
): Promise<string | Array<OpenAI.Chat.ChatCompletionContentPart>> {
  if (attachments.length === 0) return textContent;

  const parts: Array<OpenAI.Chat.ChatCompletionContentPart> = [];

  // 文本文件内容注入上下文
  const textAttachments = attachments.filter((att) => att.type === "text");
  const fileContents = await Promise.all(textAttachments.map((att) => getTextContent(att.url)));
  textAttachments.forEach((att, i) => {
    const fileContent = fileContents[i];
    if (fileContent) {
      parts.push({ type: "text", text: `[文件: ${att.name}]\n${fileContent}` });
    }
  });

  // 用户消息正文
  parts.push({ type: "text", text: textContent });

  // 图片附件
  const imageAttachments = attachments.filter((att) => att.type === "image");
  if (hasVision) {
    // 模型支持 Vision：直接发送 base64 图片（并行读取）
    const dataUrls = await Promise.all(imageAttachments.map((att) => getImageDataUrl(att.url)));
    dataUrls.forEach((dataUrl) => {
      if (dataUrl) parts.push({ type: "image_url", image_url: { url: dataUrl } });
    });
  } else {
    // 模型不支持 Vision：注入已识别的 OCR 描述
    for (const att of imageAttachments) {
      if (att.ocrText) {
        parts.push({ type: "text", text: `[图片识别结果: ${att.name}]\n${att.ocrText}` });
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
 * 为尚无 OCR 结果的图片附件补齐识别文本，并把结果写回 messages.attachments。
 *
 * 持久化是关键：OCR 是一次真实的付费模型调用，若只在内存里保存，
 * 每轮对话都会为同一张历史图片重复付费。
 */
async function ensureOcrDescriptions(
  candidates: StoredMessage[],
): Promise<{ patched: Map<string, Attachment[]>; warning?: string }> {
  const pending: Array<{ messageId: string; attachment: Attachment }> = [];
  for (const message of candidates) {
    for (const att of attachmentsOf(message)) {
      if (att.type === "image" && !att.ocrText) {
        pending.push({ messageId: message.id, attachment: att });
      }
    }
  }

  if (pending.length === 0) return { patched: new Map() };

  const [ocrSetting] = await db.select().from(settings).where(eq(settings.key, "ocr_model_id"));
  const ocrModelId = ocrSetting?.value;

  if (!ocrModelId) {
    return {
      patched: new Map(),
      warning: "当前模型不支持识图，且未设置 OCR 模型。请前往「设置 → 通用」配置 OCR 模型，或为当前模型勾选识图能力。",
    };
  }

  const [ocrModel] = await db.select().from(models).where(eq(models.id, ocrModelId));
  if (!ocrModel) {
    return { patched: new Map(), warning: "OCR 模型不存在，请重新配置。" };
  }

  const [ocrConfig] = await db.select().from(modelConfigs).where(eq(modelConfigs.id, ocrModel.modelConfigId));
  if (!ocrConfig) {
    return { patched: new Map(), warning: "OCR 模型的服务商配置不存在。" };
  }

  const ocrClient = await createLLMClient(ocrConfig);

  // 同一张图可能出现在多条消息中，按 url 去重后只识别一次
  const uniqueUrls = [...new Set(pending.map((p) => p.attachment.url))];

  const recognized = new Map<string, string>();
  await Promise.all(
    uniqueUrls.map(async (url) => {
      const dataUrl = await getImageDataUrl(url);
      if (!dataUrl) return;
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
        if (desc) recognized.set(url, desc);
      } catch {
        // 单张图片 OCR 失败不中断整体流程
      }
    })
  );

  if (recognized.size === 0) return { patched: new Map() };

  // 把结果写回各条消息的 attachments，供后续轮次直接复用
  const patched = new Map<string, Attachment[]>();
  for (const message of candidates) {
    const attachments = attachmentsOf(message);
    let changed = false;
    const next = attachments.map((att) => {
      const desc = att.type === "image" && !att.ocrText ? recognized.get(att.url) : undefined;
      if (!desc) return att;
      changed = true;
      return { ...att, ocrText: desc };
    });
    if (changed) patched.set(message.id, next);
  }

  await Promise.all(
    [...patched].map(([messageId, attachments]) =>
      db.update(messages).set({ attachments }).where(eq(messages.id, messageId))
    )
  );

  return { patched };
}

/** 粗略估算一条消息的 token 数，不触碰磁盘——用于裁剪上下文窗口。 */
function estimateMessageTokens(
  message: StoredMessage,
  hasVision: boolean,
): number {
  let total = Math.ceil(message.content.length / 4);
  for (const att of attachmentsOf(message)) {
    if (att.type === "image") {
      if (hasVision) {
        total += IMAGE_TOKEN_ESTIMATE;
      } else {
        total += att.ocrText
          ? Math.ceil(att.ocrText.length / 4)
          : PENDING_OCR_TOKEN_ESTIMATE;
      }
    } else {
      // 文本附件按文件大小估算，避免为可能被裁掉的消息读盘
      total += Math.ceil(att.size / 4);
    }
  }
  return total;
}

/**
 * 从最新一条往前保留消息，直到触达上下文预算。
 * 先裁剪、再构建内容，这样被裁掉的历史不会产生任何附件读取或 OCR 调用。
 */
function selectContextWindow(
  history: StoredMessage[],
  hasVision: boolean,
  contextWindow: number | null,
  systemPromptTokens: number,
): StoredMessage[] {
  if (!contextWindow) return history;

  const budget = contextWindow * CONTEXT_BUDGET_RATIO;
  let used = systemPromptTokens;
  const kept: StoredMessage[] = [];

  for (let i = history.length - 1; i >= 0; i--) {
    const estimated = estimateMessageTokens(history[i], hasVision);
    if (used + estimated > budget) break;
    used += estimated;
    kept.unshift(history[i]);
  }

  // 至少保留最后一条（本轮用户输入），否则请求没有任何内容可发送
  if (kept.length === 0 && history.length > 0) {
    kept.push(history[history.length - 1]);
  }
  return kept;
}

async function attemptStream(
  streamClient: OpenAI,
  streamModelName: string,
  openaiMessages: ChatMessage[],
  assistantMessageId: string,
  emit: (payload: Record<string, unknown>) => void,
  contentRef: { value: string },
  isAborted: () => boolean,
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
      // 客户端已断开：停止消费上游流，不再产生无人接收的内容
      if (isAborted()) break;

      const delta = chunk.choices[0]?.delta?.content || "";
      if (delta) {
        contentRef.value += delta;
        emit({ content: delta, messageId: assistantMessageId });
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
  const body = await req.json().catch(() => null) as {
    conversationId?: string;
    content?: string;
    modelId?: string;
    attachments?: Attachment[];
  } | null;

  const conversationId = body?.conversationId;
  const content = body?.content;
  const modelId = body?.modelId;
  const attachments = body?.attachments;

  if (!conversationId || typeof conversationId !== "string" || !content || typeof content !== "string") {
    return apiBadRequest("conversationId and content are required");
  }
  if (content.length > MAX_INPUT_LENGTH) {
    return apiBadRequest("消息内容过长");
  }
  if (!modelId) {
    return apiBadRequest("Please select a model from Settings before chatting");
  }

  // 会话与模型互不依赖，并行查询
  const [foundModelRows, conversationRows] = await Promise.all([
    db.select().from(models).where(eq(models.id, modelId)),
    db.select().from(conversations).where(eq(conversations.id, conversationId)),
  ]);

  const [foundModel] = foundModelRows;
  if (!foundModel) {
    return apiBadRequest("Model not found");
  }

  const [conversation] = conversationRows;
  if (!conversation) {
    return apiBadRequest("Conversation not found");
  }

  const [foundConfig] = await db.select().from(modelConfigs).where(eq(modelConfigs.id, foundModel.modelConfigId));
  if (!foundConfig) {
    return apiBadRequest("Model config not found");
  }

  const model: Model = foundModel;
  const config: ModelConfig = foundConfig;
  const client: OpenAI = await createLLMClient(foundConfig);
  const modelName: string = foundModel.modelId;

  let systemPrompt: string | null = null;
  if (conversation.personaId) {
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
    modelId,
    status: "success",
  });

  const [, history] = await Promise.all([
    db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId)),
    db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt)),
  ]);

  // 仅保留可作为对话上下文的角色
  const usableHistory = history.filter(
    (m) => m.role === "user" || m.role === "assistant" || m.role === "system"
  );

  const hasVision = Boolean(model.capabilities?.vision);
  const systemPromptTokens = systemPrompt ? Math.ceil(systemPrompt.length / 4) : 0;

  // ---- 先裁剪上下文，再构建内容：被裁掉的历史不产生附件读取与 OCR 调用 ----
  let contextMessages = selectContextWindow(
    usableHistory,
    hasVision,
    model.contextWindow,
    systemPromptTokens,
  );

  // ---- OCR 预处理（仅当模型不支持 Vision，且仅针对入窗消息） ----
  let ocrWarning: string | undefined;
  if (!hasVision) {
    const withImages = contextMessages.filter((m) =>
      attachmentsOf(m).some((a) => a.type === "image")
    );
    if (withImages.length > 0) {
      const ocrResult = await ensureOcrDescriptions(withImages);
      ocrWarning = ocrResult.warning;
      if (ocrResult.patched.size > 0) {
        contextMessages = contextMessages.map((m) => {
          const patchedAttachments = ocrResult.patched.get(m.id);
          return patchedAttachments ? { ...m, attachments: patchedAttachments } : m;
        });
      }
    }
  }

  // ---- 构建 openaiMessages ----
  let openaiMessages: ChatMessage[] = [];
  if (systemPrompt) {
    openaiMessages.push({ role: "system", content: systemPrompt });
  }

  const builtContents = await Promise.all(
    contextMessages.map((m) => buildMessageContent(m.content, attachmentsOf(m), hasVision))
  );
  contextMessages.forEach((m, i) => {
    const msgContent = builtContents[i];
    if (m.role === "assistant" || m.role === "system") {
      // 这两类角色不支持多模态数组，取其文本部分
      const text =
        typeof msgContent === "string"
          ? msgContent
          : msgContent.map((p) => (p.type === "text" ? p.text : "")).join("\n");
      openaiMessages.push({ role: m.role, content: text });
    } else {
      openaiMessages.push({ role: "user", content: msgContent });
    }
  });

  const assistantMessageId = nanoid();
  const encoder = new TextEncoder();
  const contentRef = { value: "" };
  const startTime = Date.now();
  const searchMode = conversation.searchMode || "off";

  // 客户端断开后停止工作：保存已生成的部分并结束
  let aborted = false;
  const onAbort = () => {
    aborted = true;
  };
  req.signal.addEventListener("abort", onAbort);
  const isAborted = () => aborted || req.signal.aborted;

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      /** 安全推送：客户端断开后 enqueue 会抛错，此处吞掉以免中断收尾逻辑 */
      const emit = (payload: Record<string, unknown>) => {
        if (closed || isAborted()) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          closed = true;
        }
      };

      let extraParams: Record<string, unknown> = {};
      let nativeProvider: SearchProvider | undefined;
      const citationsRef = { value: [] as SearchResult[] };
      let searchUsage: TokenUsage | null = null;
      let directAnswered = false;

      // ---- OCR 警告 ----
      if (ocrWarning) {
        emit({ warning: ocrWarning });
      }

      // ---- 联网搜索阶段 ----
      if (searchMode !== "off" && !isAborted()) {
        try {
          const searchConfig = await getActiveSearchConfig();
          if (searchConfig) {
            emit({ status: "searching" });
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
                  emit({ content: contentRef.value, messageId: assistantMessageId });
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
          client, modelName, openaiMessages, assistantMessageId, emit, contentRef, isAborted,
          extraParams, nativeProvider, citationsRef
        );

        if (!result.success && result.retryable && config && contentRef.value === "" && !isAborted()) {
          const fallbackModels = await db.select().from(models).where(eq(models.modelConfigId, config.id));
          const fallback = fallbackModels.find((m) => m.enabled && m.id !== model?.id);
          if (fallback) {
            result = await attemptStream(
              client, fallback.modelId, openaiMessages, assistantMessageId, emit, contentRef, isAborted,
              extraParams, nativeProvider, citationsRef
            );
          }
        }
      }

      const latencyMs = Date.now() - startTime;
      const citations = citationsRef.value.length > 0 ? citationsRef.value.map((c) => ({ title: c.title, url: c.url, snippet: c.snippet })) : null;

      // 客户端已断开：把已生成的部分保存为 cancelled，不再推送事件
      if (isAborted()) {
        if (contentRef.value) {
          await db.insert(messages).values({
            id: assistantMessageId,
            conversationId,
            role: "assistant",
            content: contentRef.value,
            modelId,
            searchResults: citations,
            latencyMs,
            status: "cancelled",
          });
        }
        try {
          controller.close();
        } catch {
          // 流可能已被下游关闭
        }
        return;
      }

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

        // 消息落库与用量日志互不依赖，并行写入
        await Promise.all([
          db.insert(messages).values({
            id: assistantMessageId,
            conversationId,
            role: "assistant",
            content: contentRef.value,
            modelId,
            tokenUsage: storedUsage,
            searchResults: citations,
            latencyMs,
            status: "success",
          }),
          combined
            ? db.insert(usageLogs).values({
                id: nanoid(),
                modelId,
                provider: config?.provider || null,
                tokensIn: combined.prompt,
                tokensOut: combined.completion,
                cost: cost || 0,
                requestType: citations ? "search" : "chat",
              })
            : Promise.resolve(),
        ]);

        emit({ done: true, messageId: assistantMessageId, usage: combined, searchResults: citations });
      } else {
        if (contentRef.value) {
          await db.insert(messages).values({
            id: assistantMessageId,
            conversationId,
            role: "assistant",
            content: contentRef.value,
            modelId,
            latencyMs,
            status: "error",
          });
        }
        emit({ error: result.error || "Unknown error" });
      }

      try {
        controller.close();
      } catch {
        // 流可能已被下游关闭
      }
    },
    cancel() {
      aborted = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // 阻止 nginx 等反向代理缓冲 SSE，否则前端要等整段结束才看到内容
      "X-Accel-Buffering": "no",
    },
  });
});
