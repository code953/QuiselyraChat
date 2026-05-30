import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { db } from "@/db";
import { messages, conversations, settings, models, modelConfigs } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { createLLMClient } from "@/lib/llm-client";

export const POST = withAuth(async (
  _req: NextRequest,
  context: { params: Promise<Record<string, string>> }
) => {
  const { id } = await context.params;

  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(asc(messages.createdAt))
    .limit(4);

  if (history.length === 0) {
    return NextResponse.json({ title: "新对话" });
  }

  const [summaryModelSetting] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, "default_summary_model_id"));

  const targetModelId = summaryModelSetting?.value || history.findLast((m) => m.modelId)?.modelId || null;

  if (!targetModelId) {
    const fallbackTitle = history.find((m) => m.role === "user")?.content.slice(0, 20).trim() || "新对话";
    await db
      .update(conversations)
      .set({ title: fallbackTitle })
      .where(eq(conversations.id, id));
    return NextResponse.json({ title: fallbackTitle });
  }

  const [model] = await db.select().from(models).where(eq(models.id, targetModelId));
  if (!model) {
    return NextResponse.json({ title: "新对话" });
  }

  const [config] = await db.select().from(modelConfigs).where(eq(modelConfigs.id, model.modelConfigId));
  if (!config) {
    return NextResponse.json({ title: "新对话" });
  }

  const client = createLLMClient(config);
  const chatContent = history
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  try {
    const response = await client.chat.completions.create({
      model: model.modelId,
      messages: [
        {
          role: "system",
          content: "Generate a very short title (max 20 characters) for this conversation in the same language as the conversation. Return ONLY the title text, nothing else.",
        },
        {
          role: "user",
          content: chatContent,
        },
      ],
      max_tokens: 30,
    });

    const title = response.choices[0]?.message?.content?.trim() || "新对话";

    await db
      .update(conversations)
      .set({ title })
      .where(eq(conversations.id, id));

    return NextResponse.json({ title });
  } catch {
    return NextResponse.json({ title: "新对话" });
  }
});
