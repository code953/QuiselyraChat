import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { db } from "@/db";
import { messages } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { apiBadRequest, apiServerError } from "@/lib/api-helpers";

export const GET = withAuth(async (req: NextRequest) => {
  try {
    const conversationId = req.nextUrl.searchParams.get("conversationId");

    if (!conversationId) {
      return apiBadRequest("conversationId is required");
    }

    const list = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt));

    return NextResponse.json(list);
  } catch {
    return apiServerError();
  }
});
