import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { db } from "@/db";
import { folders } from "@/db/schema";
import { eq } from "drizzle-orm";
import { apiNotFound, apiServerError } from "@/lib/api-helpers";

export const PUT = withAuth(async (
  req: NextRequest,
  context: { params: Promise<Record<string, string>> }
) => {
  try {
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.order !== undefined) updates.order = body.order;

    const [updated] = await db
      .update(folders)
      .set(updates)
      .where(eq(folders.id, id))
      .returning();

    if (!updated) {
      return apiNotFound("Folder not found");
    }

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

    const [deleted] = await db
      .delete(folders)
      .where(eq(folders.id, id))
      .returning();

    if (!deleted) {
      return apiNotFound("Folder not found");
    }

    return NextResponse.json({ success: true });
  } catch {
    return apiServerError();
  }
});
