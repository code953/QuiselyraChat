import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ACTIVE_SEARCH_CONFIG_KEY } from "@/lib/search";
import { apiServerError } from "@/lib/api-helpers";

export const GET = withAuth(async () => {
  try {
    const [row] = await db.select().from(settings).where(eq(settings.key, ACTIVE_SEARCH_CONFIG_KEY)).limit(1);
    return NextResponse.json({ configId: row?.value || null });
  } catch {
    return apiServerError();
  }
});

export const PUT = withAuth(async (req: NextRequest) => {
  try {
    const body = await req.json().catch(() => ({}));
    const configId: string | null = body.configId || null;

    await db
      .insert(settings)
      .values({ key: ACTIVE_SEARCH_CONFIG_KEY, value: configId })
      .onConflictDoUpdate({ target: settings.key, set: { value: configId } });

    return NextResponse.json({ configId });
  } catch {
    return apiServerError();
  }
});
