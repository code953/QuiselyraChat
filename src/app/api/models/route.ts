import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { db } from "@/db";
import { models, modelConfigs } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { apiBadRequest, apiServerError } from "@/lib/api-helpers";

export const GET = withAuth(async (req: NextRequest) => {
  try {
    const configId = req.nextUrl.searchParams.get("configId");

    const query = db
      .select({
        id: models.id,
        modelConfigId: models.modelConfigId,
        modelId: models.modelId,
        displayName: models.displayName,
        icon: models.icon,
        contextWindow: models.contextWindow,
        pricing: models.pricing,
        capabilities: models.capabilities,
        paramsOverride: models.paramsOverride,
        pinned: models.pinned,
        order: models.order,
        enabled: models.enabled,
        source: models.source,
        lastTestedAt: models.lastTestedAt,
        lastTestResult: models.lastTestResult,
        providerName: modelConfigs.name,
        providerBaseUrl: modelConfigs.baseUrl,
        provider: modelConfigs.provider,
      })
      .from(models)
      .innerJoin(modelConfigs, eq(models.modelConfigId, modelConfigs.id))
      .orderBy(desc(models.pinned), models.order);

    const list = configId
      ? await query.where(eq(models.modelConfigId, configId))
      : await query;

    return NextResponse.json(list);
  } catch {
    return apiServerError();
  }
});

export const POST = withAuth(async (req: NextRequest) => {
  try {
    const body = await req.json().catch(() => ({}));
    const { modelConfigId, modelId, displayName, icon, contextWindow, pricing, capabilities, source } = body;

    if (!modelConfigId || !modelId) {
      return apiBadRequest("modelConfigId and modelId are required");
    }

    const normalizedModelId = String(modelId).trim();

    if (!normalizedModelId) {
      return apiBadRequest("modelId is required");
    }

    const [existing] = await db
      .select()
      .from(models)
      .where(and(eq(models.modelConfigId, modelConfigId), eq(models.modelId, normalizedModelId)))
      .limit(1);

    if (existing) {
      const updates: Record<string, unknown> = {
        enabled: true,
        source: existing.source === "manual" ? "manual" : source || existing.source,
      };
      if (displayName !== undefined) updates.displayName = displayName || null;
      if (icon !== undefined) updates.icon = icon || null;
      if (contextWindow !== undefined) updates.contextWindow = contextWindow || null;
      if (pricing !== undefined) updates.pricing = pricing || null;
      if (capabilities !== undefined) updates.capabilities = capabilities;

      const [updated] = await db
        .update(models)
        .set(updates)
        .where(eq(models.id, existing.id))
        .returning();

      return NextResponse.json(updated);
    }

    const id = nanoid();

    const [model] = await db
      .insert(models)
      .values({
        id,
        modelConfigId,
        modelId: normalizedModelId,
        displayName: displayName || null,
        icon: icon || null,
        contextWindow: contextWindow || null,
        pricing: pricing || null,
        capabilities: capabilities || { chat: true, vision: false, tools: false, json: false, reasoning: false },
        source: source || "manual",
      })
      .returning();

    return NextResponse.json(model, { status: 201 });
  } catch {
    return apiServerError();
  }
});
