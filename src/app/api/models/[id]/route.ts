import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { db } from "@/db";
import { models } from "@/db/schema";
import { eq } from "drizzle-orm";
import { apiNotFound, apiServerError } from "@/lib/api-helpers";

export const PUT = withAuth(async (
  req: NextRequest,
  context: { params: Promise<Record<string, string>> }
) => {
  try {
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));

    const updates: Record<string, unknown> = {};
    if (body.displayName !== undefined) updates.displayName = body.displayName;
    if (body.enabled !== undefined) updates.enabled = body.enabled;
    if (body.pinned !== undefined) updates.pinned = body.pinned;
    if (body.order !== undefined) updates.order = body.order;
    if (body.capabilities !== undefined) updates.capabilities = body.capabilities;
    if (body.paramsOverride !== undefined) updates.paramsOverride = body.paramsOverride;

    const [updated] = await db
      .update(models)
      .set(updates)
      .where(eq(models.id, id))
      .returning();

    if (!updated) {
      return apiNotFound("Model not found");
    }

    return NextResponse.json(updated);
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
      .delete(models)
      .where(eq(models.id, id))
      .returning();

    if (!deleted) {
      return apiNotFound("Model not found");
    }

    return NextResponse.json({ success: true });
  } catch {
    return apiServerError();
  }
});
