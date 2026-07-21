import { notFound } from "next/navigation";
import { db } from "@/db";
import { conversations, messages, shareTokens } from "@/db/schema";
import { asc, eq, sql } from "drizzle-orm";
import { MarkdownRenderer } from "@/components/markdown-renderer";

export const dynamic = "force-dynamic";

async function loadShared(token: string) {
  const [share] = await db
    .select()
    .from(shareTokens)
    .where(eq(shareTokens.token, token))
    .limit(1);

  if (!share || !share.enabled) return null;
  if (share.expiresAt && new Date(share.expiresAt).getTime() < Date.now()) return null;

  const [conversation] = await db
    .select({ id: conversations.id, title: conversations.title })
    .from(conversations)
    .where(eq(conversations.id, share.conversationId))
    .limit(1);

  if (!conversation) return null;

  const msgs = await db
    .select({
      id: messages.id,
      role: messages.role,
      content: messages.content,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.conversationId, share.conversationId))
    .orderBy(asc(messages.createdAt));

  // 增加浏览计数（不阻塞渲染的失败）
  await db
    .update(shareTokens)
    .set({ viewCount: sql`${shareTokens.viewCount} + 1` })
    .where(eq(shareTokens.token, token));

  return {
    title: conversation.title,
    messages: msgs.filter((m) => m.role === "user" || m.role === "assistant"),
  };
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await loadShared(token);

  if (!data) notFound();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <header className="mb-6 border-b pb-4">
          <h1 className="text-2xl font-semibold">{data.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">只读分享 · 由 QuiselyraChat 生成</p>
        </header>

        <div className="space-y-6">
          {data.messages.map((m) => (
            <div key={m.id} className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">
                {m.role === "user" ? "用户" : "助手"}
              </div>
              {m.role === "user" ? (
                <div className="whitespace-pre-wrap rounded-lg bg-muted px-4 py-2.5 text-sm">
                  {m.content}
                </div>
              ) : (
                <div className="rounded-lg border px-4 py-2.5 text-sm">
                  <MarkdownRenderer content={m.content} />
                </div>
              )}
            </div>
          ))}
        </div>

        <footer className="mt-10 border-t pt-4 text-center text-xs text-muted-foreground">
          由 QuiselyraChat 分享
        </footer>
      </div>
    </div>
  );
}
