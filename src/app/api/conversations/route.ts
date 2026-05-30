import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { db } from "@/db";
import { conversations, personas } from "@/db/schema";
import { desc, eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";

export const GET = withAuth(async (req: NextRequest) => {
  const searchParams = req.nextUrl.searchParams;
  const folderId = searchParams.get("folderId");
  const archived = searchParams.get("archived");

  const conditions = [];

  if (folderId) {
    conditions.push(eq(conversations.folderId, folderId));
  }

  if (archived === "true") {
    conditions.push(eq(conversations.archived, true));
  } else if (archived === "false") {
    conditions.push(eq(conversations.archived, false));
  }

  const query = db
    .select({
      id: conversations.id,
      title: conversations.title,
      personaId: conversations.personaId,
      folderId: conversations.folderId,
      pinned: conversations.pinned,
      archived: conversations.archived,
      createdAt: conversations.createdAt,
      updatedAt: conversations.updatedAt,
      personaName: personas.name,
      personaAvatar: personas.avatar,
    })
    .from(conversations)
    .leftJoin(personas, eq(conversations.personaId, personas.id))
    .orderBy(desc(conversations.updatedAt));

  const list = conditions.length > 0
    ? await query.where(and(...conditions))
    : await query;

  return NextResponse.json(list);
});

export const POST = withAuth(async (req: NextRequest) => {
  const body = await req.json().catch(() => ({}));
  const id = nanoid();
  const title = body.title || "新对话";

  const [conversation] = await db
    .insert(conversations)
    .values({
      id,
      title,
      personaId: body.personaId || null,
      folderId: body.folderId || null,
    })
    .returning();

  return NextResponse.json(conversation, { status: 201 });
});
