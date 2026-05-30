import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { db } from "@/db";
import { folders } from "@/db/schema";
import { asc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { apiBadRequest, apiServerError } from "@/lib/api-helpers";

export const GET = withAuth(async () => {
  try {
    const list = await db
      .select()
      .from(folders)
      .orderBy(asc(folders.order));

    return NextResponse.json(list);
  } catch {
    return apiServerError();
  }
});

export const POST = withAuth(async (req: NextRequest) => {
  try {
    const body = await req.json().catch(() => ({}));
    const { name, order } = body;

    if (!name) {
      return apiBadRequest("name is required");
    }

    const id = nanoid();

    const [folder] = await db
      .insert(folders)
      .values({
        id,
        name,
        order: order ?? 0,
      })
      .returning();

    return NextResponse.json(folder, { status: 201 });
  } catch {
    return apiServerError();
  }
});
