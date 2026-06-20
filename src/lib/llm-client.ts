import OpenAI from "openai";
import { decrypt } from "./encryption";
import type { ModelConfig, Model } from "@/db/schema";

export const PROVIDER_PRESETS: Record<string, { name: string; baseUrl: string; modelsEndpoint?: string }> = {
  openai: { name: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  anthropic: { name: "Anthropic", baseUrl: "https://api.anthropic.com/v1" },
  google: { name: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" },
  xai: { name: "xAI Grok", baseUrl: "https://api.x.ai/v1" },
  deepseek: { name: "DeepSeek", baseUrl: "https://api.deepseek.com" },
  moonshot: { name: "Moonshot", baseUrl: "https://api.moonshot.cn/v1" },
  zhipu: { name: "智谱 AI", baseUrl: "https://open.bigmodel.cn/api/paas/v4" },
  openrouter: { name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
  ollama: { name: "Ollama", baseUrl: "http://localhost:11434/v1" },
  custom: { name: "自定义", baseUrl: "" },
};

export function createLLMClient(config: ModelConfig): OpenAI {
  let apiKey: string;
  try {
    apiKey = decrypt(config.apiKeyEncrypted);
  } catch (e) {
    throw new Error(`Failed to decrypt API key for provider "${config.name}": ${e instanceof Error ? e.message : "unknown error"}`);
  }
  return new OpenAI({
    apiKey,
    baseURL: config.baseUrl,
  });
}

export async function fetchRemoteModels(config: ModelConfig): Promise<Array<{ id: string; created?: number }>> {
  const client = createLLMClient(config);
  try {
    const list = await client.models.list();
    const result: Array<{ id: string; created?: number }> = [];
    for await (const model of list) {
      result.push({ id: model.id, created: model.created });
    }
    return result.sort((a, b) => a.id.localeCompare(b.id));
  } catch {
    return [];
  }
}

export function resolveModelParams(
  configParams: Record<string, unknown> | null,
  modelOverride: Record<string, unknown> | null,
  personaParams: Record<string, unknown> | null
): Record<string, unknown> {
  return {
    ...(configParams || {}),
    ...(personaParams || {}),
    ...(modelOverride || {}),
  };
}

export function buildChatParams(
  model: Model,
  config: ModelConfig,
  systemPrompt: string | null,
  chatMessages: Array<{ role: string; content: string }>,
  overrides: Record<string, unknown> = {}
) {
  const params = resolveModelParams(
    config.params as Record<string, unknown> | null,
    model.paramsOverride as Record<string, unknown> | null,
    null
  );

  const msgs: Array<{ role: string; content: string }> = [];
  if (systemPrompt) {
    msgs.push({ role: "system", content: systemPrompt });
  }
  msgs.push(...chatMessages);

  return {
    model: model.modelId,
    messages: msgs,
    stream: true as const,
    ...params,
    ...overrides,
  };
}
