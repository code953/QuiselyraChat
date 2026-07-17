import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { db } from "@/db";
import { images, models, modelConfigs, usageLogs } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { createLLMClient } from "@/lib/llm-client";
import { saveUpload } from "@/lib/storage";
import { apiBadRequest, apiServerError } from "@/lib/api-helpers";

function toServeUrl(filePath: string): string {
  return `/api/uploads/${filePath}`;
}

// GET /api/images —— 生成画廊列表（最新在前）
export const GET = withAuth(async () => {
  try {
    const list = await db.select().from(images).orderBy(desc(images.createdAt)).limit(200);
    return NextResponse.json(list.map((img) => ({ ...img, url: toServeUrl(img.filePath) })));
  } catch {
    return apiServerError();
  }
});

// POST /api/images —— 文生图
export const POST = withAuth(async (req: NextRequest) => {
  try {
    const body = await req.json().catch(() => ({}));
    const { prompt, modelId, size } = body as { prompt?: string; modelId?: string; size?: string };

    if (!prompt || !modelId) {
      return apiBadRequest("prompt and modelId are required");
    }

    const [model] = await db.select().from(models).where(eq(models.id, modelId));
    if (!model) return apiBadRequest("Model not found");
    const [config] = await db.select().from(modelConfigs).where(eq(modelConfigs.id, model.modelConfigId));
    if (!config) return apiBadRequest("Model config not found");

    const client = await createLLMClient(config);
    const imageSize = size || "1024x1024";

    let bytes: Buffer;
    try {
      const res = await client.images.generate({
        model: model.modelId,
        prompt,
        size: imageSize as "1024x1024",
        n: 1,
        response_format: "b64_json",
      });

      const first = res.data?.[0];
      if (first?.b64_json) {
        bytes = Buffer.from(first.b64_json, "base64");
      } else if (first?.url) {
        // 某些提供商仅返回 url，服务端拉取字节
        const imgRes = await fetch(first.url);
        bytes = Buffer.from(await imgRes.arrayBuffer());
      } else {
        throw new Error("No image data returned");
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "生成失败";
      // 记录失败行便于排查
      const failId = nanoid();
      await db.insert(images).values({
        id: failId,
        prompt,
        modelId: model.id,
        provider: config.provider,
        size: imageSize,
        filePath: "",
        status: "error",
      });
      return apiServerError(message);
    }

    const id = nanoid();
    const fileName = `${id}.png`;
    await saveUpload(fileName, bytes);

    const [row] = await db
      .insert(images)
      .values({
        id,
        prompt,
        modelId: model.id,
        provider: config.provider,
        size: imageSize,
        filePath: fileName,
        status: "success",
      })
      .returning();

    // 计费：图像定价通常按张计，pricing 未细分则记 0
    await db.insert(usageLogs).values({
      id: nanoid(),
      modelId: model.id,
      provider: config.provider,
      tokensIn: 0,
      tokensOut: 0,
      cost: 0,
      requestType: "image",
    });

    return NextResponse.json({ ...row, url: toServeUrl(row.filePath) }, { status: 201 });
  } catch {
    return apiServerError();
  }
});
