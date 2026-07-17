import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import { and, desc, eq, like, or } from "drizzle-orm";
import { apiServerError } from "@/lib/api-helpers";

export interface SearchHit {
  conversationId: string;
  title: string;
  matchType: "title" | "message";
  snippet: string;
  role?: string;
  createdAt: number;
}

// 转义 LIKE 中的特殊字符，避免用户输入 % / _ 被当作通配符
function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function buildSnippet(content: string, query: string, radius = 40): string {
  const lower = content.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx < 0) return content.slice(0, radius * 2);
  const start = Math.max(0, idx - radius);
  const end = Math.min(content.length, idx + query.length + radius);
  return `${start > 0 ? "…" : ""}${content.slice(start, end)}${end < content.length ? "…" : ""}`;
}

export const GET = withAuth(async (req: NextRequest) => {
  try {
    const q = (req.nextUrl.searchParams.get("q") || "").trim();
    if (!q) return NextResponse.json([] as SearchHit[]);

    const pattern = `%${escapeLike(q)}%`;

    // 命中标题的会话
    const titleHits = await db
      .select({
        conversationId: conversations.id,
        title: conversations.title,
        updatedAt: conversations.updatedAt,
      })
      .from(conversations)
      .where(like(conversations.title, pattern))
      .orderBy(desc(conversations.updatedAt))
      .limit(50);

    // 命中消息内容
    const messageHits = await db
      .select({
        conversationId: messages.conversationId,
        title: conversations.title,
        content: messages.content,
        role: messages.role,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(and(like(messages.content, pattern), or(eq(messages.role, "user"), eq(messages.role, "assistant"))))
      .orderBy(desc(messages.createdAt))
      .limit(50);

    const results: SearchHit[] = [];

    for (const t of titleHits) {
      results.push({
        conversationId: t.conversationId,
        title: t.title,
        matchType: "title",
        snippet: t.title,
        createdAt: t.updatedAt instanceof Date ? t.updatedAt.getTime() : Number(t.updatedAt),
      });
    }

    for (const m of messageHits) {
      results.push({
        conversationId: m.conversationId,
        title: m.title,
        matchType: "message",
        snippet: buildSnippet(m.content, q),
        role: m.role,
        createdAt: m.createdAt instanceof Date ? m.createdAt.getTime() : Number(m.createdAt),
      });
    }

    results.sort((a, b) => b.createdAt - a.createdAt);
    return NextResponse.json(results.slice(0, 50));
  } catch {
    return apiServerError();
  }
});
