import { decrypt } from "@/lib/encryption";
import { db } from "@/db";
import { searchConfigs, settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { SearchConfig, SearchProvider } from "./types";
import { createTavilyProvider } from "./tavily";
import { createSearxngProvider } from "./searxng";
import { createZhipuProvider } from "./zhipu";

export type { SearchProvider, SearchResult, SearchOptions } from "./types";

export const ACTIVE_SEARCH_CONFIG_KEY = "active_search_config_id";

// OpenAI 兼容的 web_search 工具定义（用于通用 provider 的 Function Calling）
export const WEB_SEARCH_TOOL = {
  type: "function" as const,
  function: {
    name: "web_search",
    description: "搜索互联网以获取实时或最新信息。当问题涉及近期事件、实时数据或你不确定的事实时调用。",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "要搜索的查询词",
        },
      },
      required: ["query"],
    },
  },
};

export async function getSearchProvider(config: SearchConfig): Promise<SearchProvider> {
  switch (config.provider) {
    case "tavily": {
      if (!config.apiKeyEncrypted) throw new Error("Tavily 需要 API Key");
      const apiKey = await decrypt(config.apiKeyEncrypted);
      return createTavilyProvider(apiKey);
    }
    case "searxng": {
      if (!config.baseUrl) throw new Error("SearXNG 需要 Base URL");
      return createSearxngProvider(config.baseUrl);
    }
    case "zhipu":
      return createZhipuProvider();
    default:
      throw new Error(`不支持的搜索提供商：${config.provider}`);
  }
}

export const SEARCH_PROVIDER_PRESETS: Record<string, { name: string; kind: "function" | "native"; needsKey: boolean; needsBaseUrl: boolean }> = {
  tavily: { name: "Tavily", kind: "function", needsKey: true, needsBaseUrl: false },
  searxng: { name: "SearXNG（自建）", kind: "function", needsKey: false, needsBaseUrl: true },
  zhipu: { name: "智谱（原生）", kind: "native", needsKey: false, needsBaseUrl: false },
};

/**
 * 解析当前生效的搜索配置：优先取 settings 中记录的 active id，
 * 否则回退到第一个启用的配置。均无则返回 null。
 */
export async function getActiveSearchConfig(): Promise<SearchConfig | null> {
  const [activeSetting] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, ACTIVE_SEARCH_CONFIG_KEY))
    .limit(1);

  const activeId = activeSetting?.value;
  if (activeId) {
    const [config] = await db.select().from(searchConfigs).where(eq(searchConfigs.id, activeId)).limit(1);
    if (config && config.enabled) return config;
  }

  const [fallback] = await db
    .select()
    .from(searchConfigs)
    .where(eq(searchConfigs.enabled, true))
    .limit(1);
  return fallback || null;
}
