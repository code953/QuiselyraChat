import { NextRequest } from "next/server";
import { withAuth } from "@/lib/middleware";
import { db } from "@/db";
import { messages, conversations, models, modelConfigs, personas, usageLogs } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { createLLMClient } from "@/lib/llm-client";
import { apiBadRequest } from "@/lib/api-helpers";
import type OpenAI from "openai";

type TokenUsage = { prompt: number; completion: number; total: number; cost?: number };
type Model = typeof models.$inferSelect;
type ModelConfig = typeof modelConfigs.$inferSelect;

async function attemptStream(
  streamClient: OpenAI,
  streamModelName: string,
  openaiMessages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
  assistantMessageId: string,
  encoder: TextEncoder,
  controller: ReadableStreamDefaultController,
  contentRef: { value: string },
): Promise<{ usage: TokenUsage | null; success: boolean; retryable: boolean; error?: string }> {
  let usage: TokenUsage | null = null;
  try {
    const response = await streamClient.chat.completions.create({
      model: streamModelName,
      messages: openaiMessages,
      stream: true,
      stream_options: { include_usage: true },
    });

    for await (const chunk of response) {
      const delta = chunk.choices[0]?.delta?.content || "";
      if (delta) {
        contentRef.value += delta;
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ content: delta, messageId: assistantMessageId })}\n\n`)
        );
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
  const { conversationId, content, modelId } = await req.json();

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
    client = createLLMClient(foundConfig);
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

  let openaiMessages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [];

  if (systemPrompt) {
    openaiMessages.push({ role: "system", content: systemPrompt });
  }

  openaiMessages.push(
    ...history.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    }))
  );

  if (model?.contextWindow) {
    const maxTokens = model.contextWindow;
    let totalTokens = 0;
    const systemMsg = systemPrompt ? [openaiMessages[0]] : [];
    const chatMsgs = systemPrompt ? openaiMessages.slice(1) : [...openaiMessages];

    for (const msg of systemMsg) {
      totalTokens += Math.ceil(msg.content.length / 4);
    }

    const kept: typeof chatMsgs = [];
    for (let i = chatMsgs.length - 1; i >= 0; i--) {
      const estimated = Math.ceil(chatMsgs[i].content.length / 4);
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

  const stream = new ReadableStream({
    async start(controller) {
      let result = await attemptStream(client, modelName, openaiMessages, assistantMessageId, encoder, controller, contentRef);

      if (!result.success && result.retryable && config && contentRef.value === "") {
        const fallbackModels = await db.select().from(models).where(eq(models.modelConfigId, config.id));
        const fallback = fallbackModels.find((m) => m.enabled && m.id !== model?.id);
        if (fallback) {
          result = await attemptStream(client, fallback.modelId, openaiMessages, assistantMessageId, encoder, controller, contentRef);
        }
      }

      const latencyMs = Date.now() - startTime;

      if (result.success) {
        const tokenUsage = result.usage || null;

        let cost: number | undefined;
        if (tokenUsage && model?.pricing) {
          const pricing = model.pricing as { inputPer1k?: number; outputPer1k?: number };
          cost = ((pricing.inputPer1k || 0) * tokenUsage.prompt + (pricing.outputPer1k || 0) * tokenUsage.completion) / 1000;
        }

        const storedUsage = tokenUsage ? { ...tokenUsage, ...(cost !== undefined ? { cost } : {}) } : null;

        await db.insert(messages).values({
          id: assistantMessageId,
          conversationId,
          role: "assistant",
          content: contentRef.value,
          modelId: modelId || null,
          tokenUsage: storedUsage,
          latencyMs,
          status: "success",
        });

        if (tokenUsage) {
          await db.insert(usageLogs).values({
            id: nanoid(),
            modelId: modelId || null,
            provider: config?.provider || null,
            tokensIn: tokenUsage.prompt,
            tokensOut: tokenUsage.completion,
            cost: cost || 0,
            requestType: "chat",
          });
        }

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ done: true, messageId: assistantMessageId, usage: result.usage })}\n\n`)
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
