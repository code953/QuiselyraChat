import type { SearchConfig } from "@/db/schema";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string;
  score?: number;
}

export interface SearchOptions {
  maxResults?: number;
}

export interface SearchProvider {
  id: string;
  kind: "function" | "native";
  /** 通用（function）提供商：执行外部检索并返回结果 */
  search(query: string, opts?: SearchOptions): Promise<SearchResult[]>;
  /** 原生（native）提供商：返回要合并进 chat.completions.create 的额外参数 */
  buildNativeParams?(): Record<string, unknown>;
  /** 原生提供商：从流式/非流式响应中解析引用来源 */
  parseCitations?(payload: unknown): SearchResult[];
}

export type { SearchConfig };
