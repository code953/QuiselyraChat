import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { db } from "@/db";
import { images, models, modelConfigs, usageLogs } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { createLLMClient } from "@/lib/llm-client";
import { saveUpload } from "@/lib/storage";
import { apiBadRequest, apiServerError } from "@/lib/api-helpers";
import { toFile } from "openai";

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

// POST /api/images —— 文生图 / 图生图
export const POST = withAuth(async (req: NextRequest) => {
  try {
    const contentType = req.headers.get("content-type") || "";
    let prompt: string | undefined;
    let modelId: string | undefined;
    let size: string | undefined;
    let referenceImageBuffer: Buffer | null = null;
    let referenceImageName: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      // FormData 模式（带参考图）
      const formData = await req.formData();
      prompt = formData.get("prompt") as string | undefined;
      modelId = formData.get("modelId") as string | undefined;
      size = formData.get("size") as string | undefined;
      const refFile = formData.get("referenceImage");
      if (refFile && refFile instanceof Blob) {
        referenceImageBuffer = Buffer.from(await refFile.arrayBuffer());
        referenceImageName = refFile instanceof File ? refFile.name : "reference.png";
      }
    } else {
      // JSON 模式（纯文生图）
      const body = await req.json().catch(() => ({}));
      prompt = body.prompt;
      modelId = body.modelId;
      size = body.size;
    }

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
      if (referenceImageBuffer) {
        // 图生图：使用 images.edit
        try {
          const imageFile = await toFile(referenceImageBuffer, referenceImageName || "reference.png");
          const res = await client.images.edit({
            model: model.modelId,
            image: imageFile,
            prompt,
            size: imageSize as "1024x1024",
            n: 1,
            response_format: "b64_json",
          });

          const first = res.data?.[0];
          if (first?.b64_json) {
            bytes = Buffer.from(first.b64_json, "base64");
          } else if (first?.url) {
            const imgRes = await fetch(first.url);
            bytes = Buffer.from(await imgRes.arrayBuffer());
          } else {
            throw new Error("No image data returned");
          }
        } catch (editError: unknown) {
          // 若 images.edit 不支持，降级为 images.generate 并在 prompt 中描述参考图
          const editMsg = editError instanceof Error ? editError.message : "";
          if (editMsg.includes("not supported") || editMsg.includes("404") || editMsg.includes("not found")) {
            const res = await client.images.generate({
              model: model.modelId,
              prompt: `Based on the provided reference image style: ${prompt}`,
              size: imageSize as "1024x1024",
              n: 1,
              response_format: "b64_json",
            });
            const first = res.data?.[0];
            if (first?.b64_json) {
              bytes = Buffer.from(first.b64_json, "base64");
            } else if (first?.url) {
              const imgRes = await fetch(first.url);
              bytes = Buffer.from(await imgRes.arrayBuffer());
            } else {
              throw new Error("No image data returned");
            }
          } else {
            throw editError;
          }
        }
      } else {
        // 纯文生图
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
          const imgRes = await fetch(first.url);
          bytes = Buffer.from(await imgRes.arrayBuffer());
        } else {
          throw new Error("No image data returned");
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "生成失败";
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

    // 计费
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
