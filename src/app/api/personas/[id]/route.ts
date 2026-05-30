import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { db } from "@/db";
import { personas } from "@/db/schema";
import { eq } from "drizzle-orm";
import { apiBadRequest, apiNotFound, apiServerError } from "@/lib/api-helpers";

export const PUT = withAuth(async (
  req: NextRequest,
  context: { params: Promise<Record<string, string>> }
) => {
  try {
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));

    const [existing] = await db
      .select()
      .from(personas)
      .where(eq(personas.id, id));

    if (!existing) {
      return apiNotFound("Persona not found");
    }

    if (existing.builtin && body.systemPrompt !== undefined) {
      return apiBadRequest("Cannot edit systemPrompt of builtin personas");
    }

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.avatar !== undefined) updates.avatar = body.avatar;
    if (body.systemPrompt !== undefined) updates.systemPrompt = body.systemPrompt;
    if (body.recommendedModel !== undefined) updates.recommendedModel = body.recommendedModel;
    if (body.params !== undefined) updates.params = body.params;
    if (body.greeting !== undefined) updates.greeting = body.greeting;
    updates.updatedAt = new Date();

    const [updated] = await db
      .update(personas)
      .set(updates)
      .where(eq(personas.id, id))
      .returning();

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

    const [existing] = await db
      .select()
      .from(personas)
      .where(eq(personas.id, id));

    if (!existing) {
      return apiNotFound("Persona not found");
    }

    if (existing.builtin) {
      return apiBadRequest("Cannot delete builtin personas");
    }

    await db.delete(personas).where(eq(personas.id, id));

    return NextResponse.json({ success: true });
  } catch {
    return apiServerError();
  }
});
