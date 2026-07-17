import type { SearchProvider, SearchResult } from "./types";

interface ZhipuWebSearchItem {
  title?: string;
  link?: string;
  content?: string;
  media?: string;
}

// 智谱原生联网搜索：通过 chat.completions 的 tools 参数启用，引用来源随响应返回
export function createZhipuProvider(): SearchProvider {
  return {
    id: "zhipu",
    kind: "native",
    async search(): Promise<SearchResult[]> {
      // 原生提供商不外调工具
      return [];
    },
    buildNativeParams() {
      return {
        tools: [
          {
            type: "web_search",
            web_search: { enable: true, search_result: true },
          },
        ],
      };
    },
    parseCitations(payload: unknown): SearchResult[] {
      // 智谱在 chunk / 响应上以 web_search 数组返回来源
      const arr = (payload as { web_search?: ZhipuWebSearchItem[] })?.web_search;
      if (!Array.isArray(arr)) return [];
      return arr.map((r) => ({
        title: r.title || r.link || "",
        url: r.link || "",
        snippet: r.content || "",
      }));
    },
  };
}
