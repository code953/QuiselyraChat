import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { db } from "@/db";
import { usageLogs } from "@/db/schema";
import { gte, sql } from "drizzle-orm";
import { apiServerError } from "@/lib/api-helpers";

export const GET = withAuth(async (req: NextRequest) => {
  try {
    const daysParam = req.nextUrl.searchParams.get("days");
    const days = daysParam ? parseInt(daysParam, 10) : 7;

    const since = new Date();
    since.setDate(since.getDate() - days);

    const stats = await db
      .select({
        totalRequests: sql<number>`count(*)`,
        totalTokensIn: sql<number>`coalesce(sum(${usageLogs.tokensIn}), 0)`,
        totalTokensOut: sql<number>`coalesce(sum(${usageLogs.tokensOut}), 0)`,
        totalCost: sql<number>`coalesce(sum(${usageLogs.cost}), 0)`,
      })
      .from(usageLogs)
      .where(gte(usageLogs.createdAt, since));

    const byModel = await db
      .select({
        modelId: usageLogs.modelId,
        provider: usageLogs.provider,
        requests: sql<number>`count(*)`,
        tokensIn: sql<number>`coalesce(sum(${usageLogs.tokensIn}), 0)`,
        tokensOut: sql<number>`coalesce(sum(${usageLogs.tokensOut}), 0)`,
        cost: sql<number>`coalesce(sum(${usageLogs.cost}), 0)`,
      })
      .from(usageLogs)
      .where(gte(usageLogs.createdAt, since))
      .groupBy(usageLogs.modelId, usageLogs.provider);

    const byDay = await db
      .select({
        date: sql<string>`date(${usageLogs.createdAt}, 'unixepoch')`,
        requests: sql<number>`count(*)`,
        tokensIn: sql<number>`coalesce(sum(${usageLogs.tokensIn}), 0)`,
        tokensOut: sql<number>`coalesce(sum(${usageLogs.tokensOut}), 0)`,
        cost: sql<number>`coalesce(sum(${usageLogs.cost}), 0)`,
      })
      .from(usageLogs)
      .where(gte(usageLogs.createdAt, since))
      .groupBy(sql`date(${usageLogs.createdAt}, 'unixepoch')`)
      .orderBy(sql`date(${usageLogs.createdAt}, 'unixepoch')`);

    return NextResponse.json({
      days,
      summary: stats[0] || { totalRequests: 0, totalTokensIn: 0, totalTokensOut: 0, totalCost: 0 },
      byModel,
      byDay,
    });
  } catch {
    return apiServerError();
  }
});
