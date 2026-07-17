import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { db } from "@/db";
import { searchConfigs } from "@/db/schema";
import { desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { encrypt } from "@/lib/encryption";
import { apiBadRequest, apiServerError, stripSensitiveFields } from "@/lib/api-helpers";
import { SEARCH_PROVIDER_PRESETS } from "@/lib/search";

export const GET = withAuth(async () => {
  try {
    const rows = await db.select().from(searchConfigs).orderBy(desc(searchConfigs.createdAt));
    return NextResponse.json(rows.map((row) => stripSensitiveFields(row)));
  } catch {
    return apiServerError();
  }
});

export const POST = withAuth(async (req: NextRequest) => {
  try {
    const body = await req.json().catch(() => ({}));
    const { provider, name, baseUrl, apiKey, params, enabled } = body;

    if (!provider || !name) {
      return apiBadRequest("provider and name are required");
    }
    const preset = SEARCH_PROVIDER_PRESETS[provider];
    if (!preset) return apiBadRequest("Unsupported search provider");
    if (preset.needsKey && !apiKey) return apiBadRequest(`${preset.name} 需要 API Key`);
    if (preset.needsBaseUrl && !baseUrl) return apiBadRequest(`${preset.name} 需要 Base URL`);

    const apiKeyEncrypted = apiKey ? await encrypt(apiKey) : null;

    const [config] = await db
      .insert(searchConfigs)
      .values({
        id: nanoid(),
        provider,
        name,
        baseUrl: baseUrl || null,
        apiKeyEncrypted,
        kind: preset.kind,
        params: params || null,
        enabled: enabled !== undefined ? enabled : true,
      })
      .returning();

    return NextResponse.json(stripSensitiveFields(config), { status: 201 });
  } catch {
    return apiServerError();
  }
});
