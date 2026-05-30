import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { db } from "@/db";
import { personas } from "@/db/schema";
import { desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { apiBadRequest, apiServerError } from "@/lib/api-helpers";

export const GET = withAuth(async () => {
  try {
    const list = await db
      .select()
      .from(personas)
      .orderBy(desc(personas.builtin), desc(personas.updatedAt));

    return NextResponse.json(list);
  } catch {
    return apiServerError();
  }
});

export const POST = withAuth(async (req: NextRequest) => {
  try {
    const body = await req.json().catch(() => ({}));
    const { name, avatar, systemPrompt, recommendedModel, params, greeting } = body;

    if (!name || !systemPrompt) {
      return apiBadRequest("name and systemPrompt are required");
    }

    const id = nanoid();

    const [persona] = await db
      .insert(personas)
      .values({
        id,
        name,
        avatar: avatar || "🤖",
        systemPrompt,
        recommendedModel: recommendedModel || null,
        params: params || null,
        greeting: greeting || null,
        builtin: false,
      })
      .returning();

    return NextResponse.json(persona, { status: 201 });
  } catch {
    return apiServerError();
  }
});
