import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import { eq } from "drizzle-orm";

export const PATCH = withAuth(async (
  req: NextRequest,
  context: { params: Promise<Record<string, string>> }
) => {
  const { id } = await context.params;
  const body = await req.json();

  const updates: Record<string, unknown> = {};

  if (body.title !== undefined) updates.title = body.title;
  if (body.pinned !== undefined) updates.pinned = body.pinned;
  if (body.archived !== undefined) updates.archived = body.archived;
  if (body.folderId !== undefined) updates.folderId = body.folderId;
  if (body.personaId !== undefined) updates.personaId = body.personaId;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ code: "BAD_REQUEST", message: "No fields to update" }, { status: 400 });
  }

  updates.updatedAt = new Date();

  const [updated] = await db
    .update(conversations)
    .set(updates)
    .where(eq(conversations.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ code: "NOT_FOUND", message: "Conversation not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
});

export const DELETE = withAuth(async (
  _req: NextRequest,
  context: { params: Promise<Record<string, string>> }
) => {
  const { id } = await context.params;

  await db.delete(messages).where(eq(messages.conversationId, id));
  await db.delete(conversations).where(eq(conversations.id, id));

  return NextResponse.json({ success: true });
});
