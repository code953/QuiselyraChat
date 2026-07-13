import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { db } from "@/db";
import { modelConfigs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { encrypt } from "@/lib/encryption";
import { apiBadRequest, apiNotFound, apiServerError, stripSensitiveFields } from "@/lib/api-helpers";

export const GET = withAuth(async (
  _req: NextRequest,
  context: { params: Promise<Record<string, string>> }
) => {
  try {
    const { id } = await context.params;

    const [config] = await db
      .select()
      .from(modelConfigs)
      .where(eq(modelConfigs.id, id));

    if (!config) {
      return apiNotFound("Model config not found");
    }

    return NextResponse.json(stripSensitiveFields(config));
  } catch {
    return apiServerError();
  }
});

export const PUT = withAuth(async (
  req: NextRequest,
  context: { params: Promise<Record<string, string>> }
) => {
  try {
    const { id } = await context.params;
    let body;
    try {
      body = await req.json();
    } catch {
      return apiBadRequest("Invalid JSON body");
    }

    const updates: Record<string, unknown> = {};
    if (body.provider !== undefined) updates.provider = body.provider;
    if (body.name !== undefined) updates.name = body.name;
    if (body.baseUrl !== undefined) updates.baseUrl = body.baseUrl;
    if (body.apiKey !== undefined) updates.apiKeyEncrypted = await encrypt(body.apiKey);
    if (body.params !== undefined) updates.params = body.params;
    if (body.enabled !== undefined) updates.enabled = body.enabled;

    const [updated] = await db
      .update(modelConfigs)
      .set(updates)
      .where(eq(modelConfigs.id, id))
      .returning();

    if (!updated) {
      return apiNotFound("Model config not found");
    }

    return NextResponse.json(stripSensitiveFields(updated));
  } catch {
    return apiServerError();
  }
});

export const DELETE = withAuth(async (
  _req: NextRequest,
  context: { params: Promise<Record<string, string>> }
) => {
  try {
    const { id } = await context.params;

    const [deleted] = await db
      .delete(modelConfigs)
      .where(eq(modelConfigs.id, id))
      .returning();

    if (!deleted) {
      return apiNotFound("Model config not found");
    }

    return NextResponse.json({ success: true });
  } catch {
    return apiServerError();
  }
});
