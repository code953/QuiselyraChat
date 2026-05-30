import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { db } from "@/db";
import { modelConfigs } from "@/db/schema";
import { desc, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { encrypt } from "@/lib/encryption";
import { apiBadRequest, apiServerError } from "@/lib/api-helpers";
import { getTableColumns } from "drizzle-orm";

export const GET = withAuth(async () => {
  try {
    const list = await db
      .select({
        ...getTableColumns(modelConfigs),
        modelCount: sql<number>`(select count(*) from models where model_config_id = ${modelConfigs.id})`,
      })
      .from(modelConfigs)
      .orderBy(desc(modelConfigs.createdAt));

    return NextResponse.json(list);
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

    return NextResponse.json(config, { status: 201 });
  } catch {
    return apiServerError();
  }
});
