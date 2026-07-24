import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";

const SETTING_KEY = "ocr_model_id";

// GET /api/settings/ocr-model —— 获取默认 OCR 模型
export const GET = withAuth(async () => {
  const [setting] = await db.select().from(settings).where(eq(settings.key, SETTING_KEY));
  return NextResponse.json({ modelId: setting?.value || null });
});

// PUT /api/settings/ocr-model —— 设置默认 OCR 模型
export const PUT = withAuth(async (req: NextRequest) => {
  const body = await req.json().catch(() => ({}));
  const modelId = typeof body.modelId === "string" && body.modelId ? body.modelId : null;

  await db
    .insert(settings)
    .values({ key: SETTING_KEY, value: modelId })
    .onConflictDoUpdate({ target: settings.key, set: { value: modelId } });

  return NextResponse.json({ modelId });
});
