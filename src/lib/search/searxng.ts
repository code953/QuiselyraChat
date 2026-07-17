import type { SearchProvider, SearchResult, SearchOptions } from "./types";

interface SearxngRawResult {
  title?: string;
  url?: string;
  content?: string;
}

// SearXNG 自建实例：需在实例 settings.yml 中开启 format: [html, json]
export function createSearxngProvider(baseUrl: string): SearchProvider {
  const normalized = baseUrl.replace(/\/$/, "");
  return {
    id: "searxng",
    kind: "function",
    async search(query: string, opts?: SearchOptions): Promise<SearchResult[]> {
      const url = `${normalized}/search?q=${encodeURIComponent(query)}&format=json`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) {
        throw new Error(`SearXNG search failed: ${res.status}`);
      }
      const data = (await res.json()) as { results?: SearxngRawResult[] };
      const max = opts?.maxResults ?? 5;
      return (data.results || []).slice(0, max).map((r) => ({
        title: r.title || r.url || "",
        url: r.url || "",
        snippet: r.content || "",
      }));
    },
  };
}
