import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { db } from "@/db";
import { searchConfigs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { encrypt } from "@/lib/encryption";
import { apiNotFound, apiServerError, stripSensitiveFields } from "@/lib/api-helpers";

export const PUT = withAuth(async (
  req: NextRequest,
  context: { params: Promise<Record<string, string>> }
) => {
  try {
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.baseUrl !== undefined) updates.baseUrl = body.baseUrl || null;
    if (body.params !== undefined) updates.params = body.params;
    if (body.enabled !== undefined) updates.enabled = body.enabled;
    if (body.apiKey) updates.apiKeyEncrypted = await encrypt(body.apiKey);

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ code: "BAD_REQUEST", message: "No fields to update" }, { status: 400 });
    }

    const [updated] = await db
      .update(searchConfigs)
      .set(updates)
      .where(eq(searchConfigs.id, id))
      .returning();

    if (!updated) return apiNotFound("Search config not found");
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
    const [deleted] = await db.delete(searchConfigs).where(eq(searchConfigs.id, id)).returning();
    if (!deleted) return apiNotFound("Search config not found");
    return NextResponse.json({ success: true });
  } catch {
    return apiServerError();
  }
});
