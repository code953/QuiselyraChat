import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import { and, desc, eq, or, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { apiServerError } from "@/lib/api-helpers";

const MAX_QUERY_LENGTH = 200;
const PER_SOURCE_LIMIT = 50;
const RESULT_LIMIT = 50;

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

/**
 * 带 ESCAPE 子句的 LIKE。SQLite 的 LIKE 默认没有转义字符，
 * 若只做反斜杠转义而不声明 ESCAPE，反斜杠会被当成字面字符参与匹配，
 * 导致含 % / _ 的查询词永远匹配不到。
 */
function likeEscaped(column: SQLWrapper, pattern: string): SQL {
  return sql`${column} LIKE ${pattern} ESCAPE '\\'`;
}

function buildSnippet(content: string, query: string, radius = 40): string {
  const lower = content.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx < 0) return content.slice(0, radius * 2);
  const start = Math.max(0, idx - radius);
  const end = Math.min(content.length, idx + query.length + radius);
  return `${start > 0 ? "…" : ""}${content.slice(start, end)}${end < content.length ? "…" : ""}`;
}

function toMillis(value: Date | number | null): number {
  if (value instanceof Date) return value.getTime();
  return Number(value ?? 0);
}

export const GET = withAuth(async (req: NextRequest) => {
  try {
    const raw = (req.nextUrl.searchParams.get("q") || "").trim();
    if (!raw) return NextResponse.json([] as SearchHit[]);

    // 限制长度：超长模式串会让 LIKE 全表扫描变得更慢，且没有实际检索意义
    const q = raw.slice(0, MAX_QUERY_LENGTH);
    const pattern = `%${escapeLike(q)}%`;

    // 两条查询彼此独立，并行执行
    const [titleHits, messageHits] = await Promise.all([
      db
        .select({
          conversationId: conversations.id,
          title: conversations.title,
          updatedAt: conversations.updatedAt,
        })
        .from(conversations)
        .where(likeEscaped(conversations.title, pattern))
        .orderBy(desc(conversations.updatedAt))
        .limit(PER_SOURCE_LIMIT),

      db
        .select({
          conversationId: messages.conversationId,
          title: conversations.title,
          content: messages.content,
          role: messages.role,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .where(
          and(
            likeEscaped(messages.content, pattern),
            or(eq(messages.role, "user"), eq(messages.role, "assistant"))
          )
        )
        .orderBy(desc(messages.createdAt))
        .limit(PER_SOURCE_LIMIT),
    ]);

    const results: SearchHit[] = [
      ...titleHits.map((t) => ({
        conversationId: t.conversationId,
        title: t.title,
        matchType: "title" as const,
        snippet: t.title,
        createdAt: toMillis(t.updatedAt),
      })),
      ...messageHits.map((m) => ({
        conversationId: m.conversationId,
        title: m.title,
        matchType: "message" as const,
        snippet: buildSnippet(m.content, q),
        role: m.role,
        createdAt: toMillis(m.createdAt),
      })),
    ];

    results.sort((a, b) => b.createdAt - a.createdAt);
    return NextResponse.json(results.slice(0, RESULT_LIMIT));
  } catch {
    return apiServerError();
  }
});
