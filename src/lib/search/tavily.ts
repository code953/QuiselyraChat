import type { SearchProvider, SearchResult, SearchOptions } from "./types";

interface TavilyRawResult {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
  published_date?: string;
}

export function createTavilyProvider(apiKey: string): SearchProvider {
  return {
    id: "tavily",
    kind: "function",
    async search(query: string, opts?: SearchOptions): Promise<SearchResult[]> {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          max_results: opts?.maxResults ?? 5,
          search_depth: "basic",
        }),
      });
      if (!res.ok) {
        throw new Error(`Tavily search failed: ${res.status}`);
      }
      const data = (await res.json()) as { results?: TavilyRawResult[] };
      return (data.results || []).map((r) => ({
        title: r.title || r.url || "",
        url: r.url || "",
        snippet: r.content || "",
        score: r.score,
        publishedAt: r.published_date,
      }));
    },
  };
}
