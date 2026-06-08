import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { db } from "@/db";
import { modelConfigs, models } from "@/db/schema";
import { desc, eq, count } from "drizzle-orm";
import { nanoid } from "nanoid";
import { encrypt } from "@/lib/encryption";
import { apiBadRequest, apiServerError } from "@/lib/api-helpers";
import { getTableColumns } from "drizzle-orm";

export const GET = withAuth(async () => {
  try {
    const rows = await db
      .select({
        ...getTableColumns(modelConfigs),
        modelCount: count(models.id),
      })
      .from(modelConfigs)
      .leftJoin(models, eq(models.modelConfigId, modelConfigs.id))
      .groupBy(modelConfigs.id)
      .orderBy(desc(modelConfigs.createdAt));

    return NextResponse.json(rows.map((row) => ({ ...row, modelCount: Number(row.modelCount) || 0 })));
  } catch {
    return apiServerError();
  }
});

export const POST = withAuth(async (req: NextRequest) => {
  try {
    const body = await req.json().catch(() => ({}));
    const { provider, name, baseUrl, apiKey, params, enabled } = body;

    if (!provider || !name || !baseUrl || !apiKey) {
      return apiBadRequest("provider, name, baseUrl, and apiKey are required");
    }

    const id = nanoid();
    const apiKeyEncrypted = encrypt(apiKey);

    const [config] = await db
      .insert(modelConfigs)
      .values({
        id,
        provider,
        name,
        baseUrl,
        apiKeyEncrypted,
        params: params || null,
        enabled: enabled !== undefined ? enabled : true,
      })
      .returning();

    return NextResponse.json({ ...config, modelCount: 0 }, { status: 201 });
  } catch {
    return apiServerError();
  }
});
