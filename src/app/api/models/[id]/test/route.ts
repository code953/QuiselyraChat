import { NextResponse, type NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { withAuth } from "@/lib/middleware";
import { db } from "@/db";
import { models, modelConfigs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createLLMClient } from "@/lib/llm-client";
import { apiNotFound, apiServerError } from "@/lib/api-helpers";

type TestResult = {
  success: boolean;
  response?: string | null;
  error?: string;
  latencyMs?: number;
  tokens?: { prompt?: number; completion?: number; total?: number };
  hasToolCalls?: boolean;
};

async function measure<T>(runner: () => Promise<T>): Promise<{ value?: T; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    return { value: await runner(), latencyMs: Date.now() - start };
  } catch (error) {
    return { latencyMs: Date.now() - start, error: error instanceof Error ? error.message : "Test failed" };
  }
}

async function loadVisionTestImage(): Promise<{ dataUrl?: string; error?: string }> {
  try {
    const imagePath = join(process.cwd(), "test.png");
    const imageBuffer = await readFile(imagePath);
    if (imageBuffer.length === 0) {
      return { error: "测试图片 test.png 为空" };
    }
    return { dataUrl: `data:image/png;base64,${imageBuffer.toString("base64")}` };
  } catch (error) {
    return { error: error instanceof Error ? `测试图片加载失败：${error.message}` : "测试图片加载失败" };
  }
}

export const POST = withAuth(async (
  _req: NextRequest,
  context: { params: Promise<Record<string, string>> }
) => {
  try {
    const { id } = await context.params;

    const [model] = await db.select().from(models).where(eq(models.id, id));
    if (!model) {
      return apiNotFound("Model not found");
    }

    const [config] = await db.select().from(modelConfigs).where(eq(modelConfigs.id, model.modelConfigId));
    if (!config) {
      return apiNotFound("Model config not found");
    }

    const client = createLLMClient(config);

    const chatMeasured = await measure(() =>
      client.chat.completions.create({
        model: model.modelId,
        messages: [{ role: "user", content: "Please reply with exactly: OK" }],
        max_tokens: 10,
      })
    );
    const chatContent = chatMeasured.value?.choices[0]?.message?.content || "";
    const chat: TestResult = chatMeasured.error
      ? { success: false, error: chatMeasured.error, latencyMs: chatMeasured.latencyMs }
      : {
          success: chatContent.trim().length > 0,
          response: chatContent,
          latencyMs: chatMeasured.latencyMs,
          tokens: chatMeasured.value?.usage
            ? {
                prompt: chatMeasured.value.usage.prompt_tokens,
                completion: chatMeasured.value.usage.completion_tokens,
                total: chatMeasured.value.usage.total_tokens,
              }
            : undefined,
        };

    const visionImage = await loadVisionTestImage();
    const visionMeasured = visionImage.dataUrl
      ? await measure(() =>
          client.chat.completions.create({
            model: model.modelId,
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: "What word is shown in this image? Reply with only the word." },
                  {
                    type: "image_url",
                    image_url: {
                      url: visionImage.dataUrl,
                    },
                  },
                ],
              },
            ],
            max_tokens: 20,
          })
        )
      : { latencyMs: 0, error: visionImage.error || "测试图片加载失败" };
    const visionContent = visionMeasured.value?.choices[0]?.message?.content || "";
    const vision: TestResult = visionMeasured.error
      ? { success: false, error: visionMeasured.error, latencyMs: visionMeasured.latencyMs }
      : {
          success: /hello/i.test(visionContent),
          response: visionContent,
          error: /hello/i.test(visionContent) ? undefined : "模型未准确识别出图片中的 Hello 字段",
          latencyMs: visionMeasured.latencyMs,
        };

    const toolsMeasured = await measure(() =>
      client.chat.completions.create({
        model: model.modelId,
        messages: [{ role: "user", content: "What time is it? Use the get_current_time tool to answer." }],
        tools: [
          {
            type: "function" as const,
            function: {
              name: "get_current_time",
              description: "Get the current time",
              parameters: { type: "object", properties: {}, required: [] },
            },
          },
        ],
        max_tokens: 100,
      })
    );
    const toolCalls = toolsMeasured.value?.choices[0]?.message?.tool_calls || [];
    const tools: TestResult = toolsMeasured.error
      ? { success: false, error: toolsMeasured.error, latencyMs: toolsMeasured.latencyMs }
      : {
          success: toolCalls.length > 0,
          hasToolCalls: toolCalls.length > 0,
          response: toolsMeasured.value?.choices[0]?.message?.content || null,
          latencyMs: toolsMeasured.latencyMs,
        };

    const lastTestResult = {
      success: chat.success && vision.success && tools.success,
      chat,
      vision,
      tools,
    };

    const previousCapabilities = model.capabilities || {
      chat: true,
      vision: false,
      tools: false,
      json: false,
      reasoning: false,
    };

    const [updated] = await db
      .update(models)
      .set({
        capabilities: {
          ...previousCapabilities,
          chat: chat.success,
          vision: vision.success,
          tools: tools.success,
        },
        lastTestResult,
        lastTestedAt: new Date(),
      })
      .where(eq(models.id, id))
      .returning();

    return NextResponse.json({
      ...lastTestResult,
      model: {
        ...updated,
        providerName: config.name,
        providerBaseUrl: config.baseUrl,
        provider: config.provider,
      },
    });
  } catch {
    return apiServerError();
  }
});
