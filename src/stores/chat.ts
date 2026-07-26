import { create, type StoreApi } from "zustand";
import { toast } from "sonner";
import { authHeaders, handleAuthFailure } from "@/lib/api-helpers";

export type ChatAttachment = { type: string; url: string; name: string; size: number };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  attachments?: ChatAttachment[] | null;
  status: "success" | "error" | "cancelled" | "streaming";
  createdAt: Date;
  modelId?: string | null;
  tokenUsage?: { prompt: number; completion: number; total: number; cost?: number } | null;
  searchResults?: Array<{ title: string; url: string; snippet: string }> | null;
  searching?: boolean;
}

type StreamEvent = {
  content?: string;
  messageId?: string;
  modelId?: string | null;
  usage?: ChatMessage["tokenUsage"];
  searchResults?: ChatMessage["searchResults"];
  status?: string;
  warning?: string;
  done?: boolean;
  error?: string;
};

/** 本地乐观消息的 id 前缀，服务端返回真实 id 后会被替换 */
let localIdCounter = 0;
function localId(prefix: string): string {
  localIdCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${localIdCounter}`;
}

function parseStreamEvents(chunk: string): { events: StreamEvent[]; remaining: string } {
  const events: StreamEvent[] = [];
  const parts = chunk.split(/\r?\n\r?\n/);
  const remaining = parts.pop() || "";

  for (const part of parts) {
    const data = part
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
      .trim();

    if (!data || data === "[DONE]") continue;

    try {
      events.push(JSON.parse(data) as StreamEvent);
    } catch {}
  }

  return { events, remaining };
}

interface ChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  abortController: AbortController | null;
  selectedModelId: string | null;

  fetchMessages: (conversationId: string) => Promise<void>;
  sendMessage: (conversationId: string, content: string, attachments?: ChatAttachment[]) => Promise<void>;
  retryGeneration: (conversationId: string, assistantMessageId: string) => Promise<void>;
  stopGeneration: () => void;
  clearMessages: () => void;
  setSelectedModelId: (modelId: string | null) => void;
}

type SetState = StoreApi<ChatState>["setState"];
type GetState = StoreApi<ChatState>["getState"];

async function streamAssistantMessage(
  set: SetState,
  get: GetState,
  conversationId: string,
  content: string,
  assistantMessage: ChatMessage,
  attachments?: ChatAttachment[],
) {
  const abortController = new AbortController();
  set({ isStreaming: true, abortController });

  /** 当前助手消息在本地的 id：收到服务端 messageId 后切换为真实 id */
  let activeId = assistantMessage.id;

  /**
   * 只更新目标消息，其余元素保持同一引用——配合 MessageBubble 的记忆化，
   * 流式期间只有正在生成的那一条会重渲染。
   */
  const patchActive = (patch: Partial<ChatMessage>) => {
    set((state) => {
      const index = state.messages.findIndex((m) => m.id === activeId);
      if (index < 0) return state;
      const next = state.messages.slice();
      next[index] = { ...next[index], ...patch };
      return { messages: next };
    });
  };

  /** 服务端首次给出真实 messageId 时改写本地 id */
  const adoptServerId = (serverId: string) => {
    if (!serverId || serverId === activeId) return;
    const previousId = activeId;
    activeId = serverId;
    set((state) => {
      const index = state.messages.findIndex((m) => m.id === previousId);
      if (index < 0) return state;
      const next = state.messages.slice();
      next[index] = { ...next[index], id: serverId };
      return { messages: next };
    });
  };

  try {
    const { selectedModelId } = get();
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        conversationId,
        content,
        ...(attachments?.length ? { attachments } : {}),
        ...(selectedModelId ? { modelId: selectedModelId } : {}),
      }),
      signal: abortController.signal,
    });

    if (!res.ok || !res.body) {
      if (handleAuthFailure(res.status)) return;
      const data = await res.json().catch(() => null);
      throw new Error(data?.message || "生成失败，请稍后重试");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    /** 累积的文本增量：一批 chunk 里的多个 content 事件合并为一次 store 更新 */
    let pendingText = "";
    let pendingModelId: string | null | undefined;

    const flushPendingText = () => {
      if (!pendingText) return;
      const delta = pendingText;
      const modelId = pendingModelId;
      pendingText = "";
      pendingModelId = undefined;
      set((state) => {
        const index = state.messages.findIndex((m) => m.id === activeId);
        if (index < 0) return state;
        const next = state.messages.slice();
        next[index] = {
          ...next[index],
          content: next[index].content + delta,
          searching: false,
          ...(modelId ? { modelId } : {}),
        };
        return { messages: next };
      });
    };

    let finished = false;

    while (!finished) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        if (buffer.trim()) {
          buffer += "\n\n";
        } else {
          break;
        }
      } else {
        buffer += decoder.decode(value, { stream: true });
      }

      const parsed = parseStreamEvents(buffer);
      buffer = parsed.remaining;

      for (const data of parsed.events) {
        if (data.messageId) adoptServerId(data.messageId);

        if (data.content) {
          // 先累积，遇到非内容事件或本批结束时再一次性写入
          pendingText += data.content;
          if (data.modelId) pendingModelId = data.modelId;
          continue;
        }

        flushPendingText();

        if (data.error) {
          patchActive({
            status: "error",
            searching: false,
            content: get().messages.find((m) => m.id === activeId)?.content || data.error,
          });
          finished = true;
          break;
        }

        if (data.status === "searching") {
          patchActive({ searching: true });
          continue;
        }

        if (data.warning) {
          toast.warning(data.warning);
          continue;
        }

        if (data.done) {
          patchActive({
            status: "success",
            searching: false,
            tokenUsage: data.usage || null,
            searchResults: data.searchResults || null,
          });
        }
      }

      flushPendingText();

      if (done) break;
    }
  } catch (error: unknown) {
    const aborted = error instanceof Error && error.name === "AbortError";
    const errorMessage = error instanceof Error ? error.message : "生成失败，请稍后重试";
    set((state) => {
      const index = state.messages.findIndex((m) => m.id === activeId);
      if (index < 0) return state;
      const next = state.messages.slice();
      const target = next[index];
      next[index] = {
        ...target,
        status: aborted ? "cancelled" : "error",
        searching: false,
        content: aborted ? target.content : target.content || errorMessage,
      };
      return { messages: next };
    });
    if (!aborted) toast.error(errorMessage);
  } finally {
    set({ isStreaming: false, abortController: null });
  }
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isStreaming: false,
  abortController: null,
  selectedModelId: null,

  fetchMessages: async (conversationId: string) => {
    try {
      const res = await fetch(`/api/conversation-messages?conversationId=${encodeURIComponent(conversationId)}`, {
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        set({
          messages: data.map((message: Record<string, unknown>) => ({
            ...message,
            createdAt: new Date(message.createdAt as string | number),
            modelId: (message.modelId as string) || null,
            tokenUsage: (message.tokenUsage as ChatMessage["tokenUsage"]) || null,
            attachments: (message.attachments as ChatMessage["attachments"]) || null,
          })),
        });
      } else {
        handleAuthFailure(res.status);
        set({ messages: [] });
      }
    } catch {
      set({ messages: [] });
    }
  },

  sendMessage: async (conversationId: string, content: string, attachments?: ChatAttachment[]) => {
    if (get().isStreaming) return;

    const userMessage: ChatMessage = {
      id: localId("temp-user"),
      role: "user",
      content,
      attachments: attachments?.length ? attachments : null,
      status: "success",
      createdAt: new Date(),
    };

    const assistantMessage: ChatMessage = {
      id: localId("temp-assistant"),
      role: "assistant",
      content: "",
      status: "streaming",
      createdAt: new Date(),
    };

    set((state) => ({
      messages: [...state.messages, userMessage, assistantMessage],
    }));

    await streamAssistantMessage(set, get, conversationId, content, assistantMessage, attachments);
  },

  retryGeneration: async (conversationId: string, assistantMessageId: string) => {
    if (get().isStreaming) return;

    const currentMessages = get().messages;
    const assistantIndex = currentMessages.findIndex((message) => message.id === assistantMessageId);
    const userMessage =
      assistantIndex < 0
        ? undefined
        : currentMessages
            .slice(0, assistantIndex)
            .reverse()
            .find((message) => message.role === "user");

    if (assistantIndex < 0 || !userMessage) {
      set((state) => ({
        messages: state.messages.map((message) =>
          message.id === assistantMessageId
            ? { ...message, status: "error" as const, content: "未找到可重试的用户消息" }
            : message
        ),
      }));
      return;
    }

    const retryMessage: ChatMessage = {
      ...currentMessages[assistantIndex],
      content: "",
      status: "streaming",
      searching: false,
      tokenUsage: null,
      searchResults: null,
      createdAt: new Date(),
    };

    set((state) => ({
      messages: state.messages.map((message) => (message.id === assistantMessageId ? retryMessage : message)),
    }));

    await streamAssistantMessage(set, get, conversationId, userMessage.content, retryMessage);
  },

  stopGeneration: () => {
    const { abortController } = get();
    if (abortController) {
      abortController.abort();
    }
  },

  clearMessages: () => set({ messages: [] }),

  setSelectedModelId: (modelId: string | null) => set({ selectedModelId: modelId }),
}));
