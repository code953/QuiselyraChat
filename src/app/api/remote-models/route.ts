import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { db } from "@/db";
import { modelConfigs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { fetchRemoteModels } from "@/lib/llm-client";
import { apiBadRequest, apiNotFound, apiServerError } from "@/lib/api-helpers";

export const POST = withAuth(async (req: NextRequest) => {
  try {
    const configId = req.nextUrl.searchParams.get("configId");

    if (!configId) {
      return apiBadRequest("configId is required");
    }

    const [config] = await db
      .select()
      .from(modelConfigs)
      .where(eq(modelConfigs.id, configId));

    if (!config) {
      return apiNotFound("Model config not found");
    }

    const remoteModels = await fetchRemoteModels(config);

    await db
      .update(modelConfigs)
      .set({ modelsRefreshedAt: new Date() })
      .where(eq(modelConfigs.id, configId));

    return NextResponse.json(remoteModels);
  } catch {
    return apiServerError();
  }
});
