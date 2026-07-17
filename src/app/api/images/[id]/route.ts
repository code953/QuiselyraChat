import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { db } from "@/db";
import { images } from "@/db/schema";
import { eq } from "drizzle-orm";
import { unlink } from "fs/promises";
import { resolveUploadPath } from "@/lib/storage";
import { apiNotFound, apiServerError } from "@/lib/api-helpers";

// DELETE /api/images/[id]
export const DELETE = withAuth(async (
  _req: NextRequest,
  context: { params: Promise<Record<string, string>> }
) => {
  try {
    const { id } = await context.params;
    const [deleted] = await db.delete(images).where(eq(images.id, id)).returning();
    if (!deleted) return apiNotFound("Image not found");

    if (deleted.filePath) {
      const abs = resolveUploadPath(deleted.filePath);
      if (abs) await unlink(abs).catch(() => {});
    }

    return NextResponse.json({ success: true });
  } catch {
    return apiServerError();
  }
});
