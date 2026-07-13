import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { db } from "@/db";
import { conversations, messages, personas, models, modelConfigs, folders } from "@/db/schema";
import { nanoid } from "nanoid";
import { apiBadRequest, apiServerError } from "@/lib/api-helpers";

const IMPORT_PREFIX = "[导入] ";

type Json = Record<string, unknown>;

function asArray(v: unknown): Json[] {
  return Array.isArray(v) ? (v as Json[]) : [];
}

/** 将导出文件中的时间字段（ISO 字符串 / 时间戳数字）还原为 Date，供 drizzle timestamp 列使用。 */
function toDate(v: unknown): Date | null {
  if (v == null) return null;
  const d = new Date(v as string | number);
  return isNaN(d.getTime()) ? null : d;
}

interface CategoryStat {
  added: number;
  renamed: number;
  skipped: number;
}

function newStat(): CategoryStat {
  return { added: 0, renamed: 0, skipped: 0 };
}

export const POST = withAuth(async (req: NextRequest) => {
  let body: Json;
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("导入文件不是合法的 JSON");
  }

  if (!body || typeof body !== "object") {
    return apiBadRequest("导入文件格式不正确");
  }

  const importedConversations = asArray(body.conversations);
  const importedModels = asArray(body.models);
  const importedPersonas = asArray(body.personas);
  const messagesMap = (body.messages && typeof body.messages === "object" ? body.messages : {}) as Record<string, unknown>;

  if (
    importedConversations.length === 0 &&
    importedModels.length === 0 &&
    importedPersonas.length === 0
  ) {
    return apiBadRequest("导入文件中没有可识别的数据（conversations / models / personas 均为空）");
  }

  const stats = {
    personas: newStat(),
    conversations: newStat(),
    messages: 0,
    models: newStat(),
  };

  try {
    await db.transaction(async (tx) => {
      // 预加载现有 id 集合，用于冲突判断与外键校验。
      const [existingPersonaRows, existingConvRows, existingModelRows, existingConfigRows, existingFolderRows] =
        await Promise.all([
          tx.select({ id: personas.id }).from(personas),
          tx.select({ id: conversations.id }).from(conversations),
          tx.select({ id: models.id }).from(models),
          tx.select({ id: modelConfigs.id }).from(modelConfigs),
          tx.select({ id: folders.id }).from(folders),
        ]);

      const personaIds = new Set(existingPersonaRows.map((r) => r.id));
      const convIds = new Set(existingConvRows.map((r) => r.id));
      const modelIds = new Set(existingModelRows.map((r) => r.id));
      const configIds = new Set(existingConfigRows.map((r) => r.id));
      const folderIds = new Set(existingFolderRows.map((r) => r.id));

      // ---- 人格 ----
      for (const p of importedPersonas) {
        const originalId = String(p.id ?? "");
        if (!originalId || !p.systemPrompt || !p.name) continue;

        const conflict = personaIds.has(originalId);
        const id = conflict ? nanoid() : originalId;
        const name = conflict ? `${IMPORT_PREFIX}${p.name}` : String(p.name);

        await tx.insert(personas).values({
          id,
          name,
          avatar: (p.avatar as string) || "🤖",
          systemPrompt: String(p.systemPrompt),
          recommendedModel: (p.recommendedModel as string) ?? null,
          params: (p.params as Json) ?? null,
          greeting: (p.greeting as string) ?? null,
          // 导入的人格一律作为可编辑的用户副本，不占用系统内置人格身份。
          builtin: false,
          createdAt: toDate(p.createdAt) ?? new Date(),
          updatedAt: toDate(p.updatedAt) ?? new Date(),
        });

        personaIds.add(id);
        if (conflict) stats.personas.renamed++;
        else stats.personas.added++;
      }

      // ---- 会话 + 消息 ----
      for (const c of importedConversations) {
        const originalId = String(c.id ?? "");
        if (!originalId) continue;

        const conflict = convIds.has(originalId);
        const newConvId = conflict ? nanoid() : originalId;
        const title = conflict ? `${IMPORT_PREFIX}${c.title ?? "新对话"}` : String(c.title ?? "新对话");

        // personaId：导入人格后，原始 personaId 在库中即有效；否则置空避免悬挂引用。
        const personaId = c.personaId && personaIds.has(String(c.personaId)) ? String(c.personaId) : null;
        // folderId：文件夹不在导出范围内，仅当目标库已存在该文件夹时保留。
        const folderId = c.folderId && folderIds.has(String(c.folderId)) ? String(c.folderId) : null;

        await tx.insert(conversations).values({
          id: newConvId,
          title,
          personaId,
          folderId,
          pinned: Boolean(c.pinned),
          archived: Boolean(c.archived),
          createdAt: toDate(c.createdAt) ?? new Date(),
          updatedAt: toDate(c.updatedAt) ?? new Date(),
        });

        convIds.add(newConvId);
        if (conflict) stats.conversations.renamed++;
        else stats.conversations.added++;

        // 该会话的消息。会话被重命名（新 id）时，消息 id 同步重映射，parentMessageId 一并修正。
        const convMessages = asArray(messagesMap[originalId]);
        const msgIdMap = new Map<string, string>();
        if (conflict) {
          for (const m of convMessages) {
            const oldId = String(m.id ?? "");
            if (oldId) msgIdMap.set(oldId, nanoid());
          }
        }

        for (const m of convMessages) {
          const oldId = String(m.id ?? "");
          if (!oldId || !m.role || m.content == null) continue;

          const msgId = conflict ? msgIdMap.get(oldId)! : oldId;
          const parentRaw = m.parentMessageId ? String(m.parentMessageId) : null;
          const parentMessageId = conflict && parentRaw ? msgIdMap.get(parentRaw) ?? null : parentRaw;

          await tx.insert(messages).values({
            id: msgId,
            conversationId: newConvId,
            parentMessageId,
            role: m.role as "user" | "assistant" | "system" | "tool",
            content: String(m.content),
            attachments: (m.attachments as never) ?? null,
            tokenUsage: (m.tokenUsage as never) ?? null,
            modelId: (m.modelId as string) ?? null,
            latencyMs: (m.latencyMs as number) ?? null,
            status: (m.status as "success" | "error" | "cancelled" | "streaming") ?? "success",
            createdAt: toDate(m.createdAt) ?? new Date(),
          });
          stats.messages++;
        }
      }

      // ---- 模型 ----
      // 模型通过 modelConfigId 外键引用服务商配置，而服务商配置（含加密后的 API Key）不在导出范围内。
      // 因此仅当目标库中仍存在对应服务商时才能导入，否则计入 skipped。
      for (const m of importedModels) {
        const originalId = String(m.id ?? "");
        const configId = m.modelConfigId ? String(m.modelConfigId) : "";
        if (!originalId || !m.modelId) continue;

        if (!configId || !configIds.has(configId)) {
          stats.models.skipped++;
          continue;
        }

        const conflict = modelIds.has(originalId);
        const id = conflict ? nanoid() : originalId;
        const baseLabel = (m.displayName as string) || String(m.modelId);
        const displayName = conflict ? `${IMPORT_PREFIX}${baseLabel}` : ((m.displayName as string) ?? null);

        await tx.insert(models).values({
          id,
          modelConfigId: configId,
          modelId: String(m.modelId),
          displayName,
          icon: (m.icon as string) ?? null,
          contextWindow: (m.contextWindow as number) ?? null,
          pricing: (m.pricing as never) ?? null,
          capabilities:
            (m.capabilities as never) ??
            ({ chat: true, vision: false, tools: false, json: false, reasoning: false } as never),
          paramsOverride: (m.paramsOverride as never) ?? null,
          pinned: Boolean(m.pinned),
          order: (m.order as number) ?? 0,
          enabled: m.enabled === undefined ? true : Boolean(m.enabled),
          source: (m.source as "fetched" | "manual") ?? "manual",
          lastTestedAt: toDate(m.lastTestedAt),
          lastTestResult: (m.lastTestResult as never) ?? null,
        });

        modelIds.add(id);
        if (conflict) stats.models.renamed++;
        else stats.models.added++;
      }
    });
  } catch (e) {
    console.error("Data import failed:", e);
    return apiServerError("导入失败，数据未发生变更");
  }

  const added = stats.personas.added + stats.conversations.added + stats.models.added;
  const renamed = stats.personas.renamed + stats.conversations.renamed + stats.models.renamed;
  const skipped = stats.models.skipped;

  return NextResponse.json({
    success: true,
    added,
    renamed,
    skipped,
    messages: stats.messages,
    detail: {
      personas: stats.personas,
      conversations: stats.conversations,
      models: stats.models,
    },
  });
});
