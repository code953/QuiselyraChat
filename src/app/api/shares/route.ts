import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { db } from "@/db";
import { conversations, shareTokens } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { apiBadRequest, apiNotFound, apiServerError } from "@/lib/api-helpers";

// GET /api/shares?conversationId= —— 列出该会话的所有分享令牌
export const GET = withAuth(async (req: NextRequest) => {
  try {
    const conversationId = req.nextUrl.searchParams.get("conversationId");
    if (!conversationId) return apiBadRequest("conversationId is required");
    const tokens = await db
      .select()
      .from(shareTokens)
      .where(eq(shareTokens.conversationId, conversationId))
      .orderBy(desc(shareTokens.createdAt));
    return NextResponse.json(tokens);
  } catch {
    return apiServerError();
  }
});

// POST /api/shares —— 创建分享令牌，body { conversationId, expiresInDays? }
export const POST = withAuth(async (req: NextRequest) => {
  try {
    const body = await req.json().catch(() => ({}));
    const conversationId: string | undefined = body.conversationId;
    if (!conversationId) return apiBadRequest("conversationId is required");

    const [conversation] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    if (!conversation) return apiNotFound("Conversation not found");

    let expiresAt: Date | null = null;
    if (typeof body.expiresInDays === "number" && body.expiresInDays > 0) {
      expiresAt = new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000);
    }

    const [created] = await db
      .insert(shareTokens)
      .values({
        id: nanoid(),
        token: nanoid(24),
        conversationId,
        expiresAt,
      })
      .returning();

    return NextResponse.json(created, { status: 201 });
  } catch {
    return apiServerError();
  }
});
