import type OpenAI from "openai";
import type { SearchProvider, SearchResult } from "./types";
import { WEB_SEARCH_TOOL } from "./index";

type ChatMessage = OpenAI.Chat.ChatCompletionMessageParam;

export interface ToolPhaseResult {
  augmentedMessages: ChatMessage[];
  citations: SearchResult[];
  directAnswer?: string;
  usage: { prompt: number; completion: number; total: number } | null;
}

/**
 * 自动模式下的第一阶段：非流式调用，检测模型是否请求 web_search。
 * - 若模型直接作答 → 返回 directAnswer（省去二次流式调用）。
 * - 若模型请求工具 → 执行检索，把 tool_calls / tool 结果消息追加到 messages，供二阶段流式调用。
 */
export async function runToolPhase(
  client: OpenAI,
  modelName: string,
  messages: ChatMessage[],
  provider: SearchProvider,
  maxResults = 5
): Promise<ToolPhaseResult> {
  const response = await client.chat.completions.create({
    model: modelName,
    messages,
    tools: [WEB_SEARCH_TOOL],
    tool_choice: "auto",
    stream: false,
  });

  const choice = response.choices[0];
  const usage = response.usage
    ? {
        prompt: response.usage.prompt_tokens,
        completion: response.usage.completion_tokens,
        total: response.usage.total_tokens,
      }
    : null;

  const toolCalls = choice?.message?.tool_calls;

  // 模型直接作答，无需检索
  if (!toolCalls || toolCalls.length === 0) {
    return {
      augmentedMessages: messages,
      citations: [],
      directAnswer: choice?.message?.content || "",
      usage,
    };
  }

  const citations: SearchResult[] = [];
  const augmented: ChatMessage[] = [...messages, choice.message];

  for (const call of toolCalls) {
    if (call.type !== "function") continue;
    let query = "";
    try {
      query = JSON.parse(call.function.arguments || "{}").query || "";
    } catch {
      query = "";
    }

    let results: SearchResult[] = [];
    if (query) {
      try {
        results = await provider.search(query, { maxResults });
      } catch {
        results = [];
      }
    }
    citations.push(...results);

    augmented.push({
      role: "tool",
      tool_call_id: call.id,
      content: JSON.stringify(
        results.map((r) => ({ title: r.title, url: r.url, snippet: r.snippet }))
      ),
    });
  }

  return { augmentedMessages: augmented, citations, usage };
}

/** 强制模式：直接检索并把结果拼成一段上下文文本 */
export function buildForcedContext(results: SearchResult[]): string {
  if (results.length === 0) return "";
  const lines = results.map(
    (r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`
  );
  return `以下是联网搜索结果，请据此作答，并在合适处引用来源编号：\n\n${lines.join("\n\n")}`;
}
