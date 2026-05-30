import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { db } from "@/db";
import { modelConfigs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { fetchRemoteModels } from "@/lib/llm-client";
import { apiNotFound, apiServerError } from "@/lib/api-helpers";

export const POST = withAuth(async (
  _req: NextRequest,
  context: { params: Promise<Record<string, string>> }
) => {
  try {
    const { id } = await context.params;

    const [config] = await db
      .select()
      .from(modelConfigs)
      .where(eq(modelConfigs.id, id));

    if (!config) {
      return apiNotFound("Model config not found");
    }

    const remoteModels = await fetchRemoteModels(config);

    await db
      .update(modelConfigs)
      .set({ modelsRefreshedAt: new Date() })
      .where(eq(modelConfigs.id, id));

    return NextResponse.json(remoteModels);
  } catch {
    return apiServerError();
  }
});
