import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { db } from "@/db";
import { shareTokens } from "@/db/schema";
import { eq } from "drizzle-orm";
import { apiNotFound, apiServerError } from "@/lib/api-helpers";

// PATCH /api/share/[token] —— 切换启用状态 / 设置过期
export const PATCH = withAuth(async (
  req: NextRequest,
  context: { params: Promise<Record<string, string>> }
) => {
  try {
    const { token } = await context.params;
    const body = await req.json().catch(() => ({}));

    const updates: Record<string, unknown> = {};
    if (typeof body.enabled === "boolean") updates.enabled = body.enabled;
    if (body.expiresAt === null) updates.expiresAt = null;
    else if (typeof body.expiresInDays === "number" && body.expiresInDays > 0) {
      updates.expiresAt = new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ code: "BAD_REQUEST", message: "No fields to update" }, { status: 400 });
    }

    const [updated] = await db
      .update(shareTokens)
      .set(updates)
      .where(eq(shareTokens.token, token))
      .returning();

    if (!updated) return apiNotFound("Share token not found");
    return NextResponse.json(updated);
  } catch {
    return apiServerError();
  }
});

// DELETE /api/share/[token] —— 硬撤销
export const DELETE = withAuth(async (
  _req: NextRequest,
  context: { params: Promise<Record<string, string>> }
) => {
  try {
    const { token } = await context.params;
    const [deleted] = await db
      .delete(shareTokens)
      .where(eq(shareTokens.token, token))
      .returning();
    if (!deleted) return apiNotFound("Share token not found");
    return NextResponse.json({ success: true });
  } catch {
    return apiServerError();
  }
});
