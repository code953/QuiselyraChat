import { create, type StoreApi } from "zustand";
import { toast } from "sonner";
import { authHeaders } from "@/lib/api-helpers";

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
      const data = await res.json().catch(() => null);
      throw new Error(data?.message || "生成失败，请稍后重试");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let activeAssistantId = assistantMessage.id;

    while (true) {
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
        const targetId = data.messageId || activeAssistantId;
        const previousAssistantId = activeAssistantId;

        if (data.messageId) {
          activeAssistantId = data.messageId;
        }

        if (data.error) {
          set((state) => ({
            messages: state.messages.map((message) =>
              message.id === activeAssistantId || message.id === assistantMessage.id
                ? {
                    ...message,
                    id: activeAssistantId,
                    status: "error" as const,
                    searching: false,
                    content: message.content || data.error || "生成失败，请稍后重试",
                  }
                : message
            ),
          }));
          break;
        }

        if (data.status === "searching") {
          set((state) => ({
            messages: state.messages.map((message) =>
              message.id === previousAssistantId || message.id === activeAssistantId || message.id === assistantMessage.id
                ? { ...message, searching: true }
                : message
            ),
          }));
          continue;
        }

        if (data.warning) {
          toast.warning(data.warning);
          continue;
        }

        if (data.content) {
          set((state) => ({
            messages: state.messages.map((message) =>
              message.id === previousAssistantId || message.id === activeAssistantId || message.id === assistantMessage.id
                ? {
                    ...message,
                    id: targetId,
                    content: message.content + data.content,
                    searching: false,
                    modelId: data.modelId || message.modelId,
                  }
                : message
            ),
          }));
        }

        if (data.done) {
          set((state) => ({
            messages: state.messages.map((message) =>
              message.id === targetId || message.id === assistantMessage.id
                ? {
                    ...message,
                    id: targetId,
                    status: "success" as const,
                    searching: false,
                    tokenUsage: data.usage || null,
                    searchResults: data.searchResults || null,
                  }
                : message
            ),
          }));
        }
      }

      if (done) break;
    }
  } catch (error: unknown) {
    const aborted = error instanceof Error && error.name === "AbortError";
    const errorMessage = error instanceof Error ? error.message : "生成失败，请稍后重试";
    set((state) => ({
      messages: state.messages.map((message) =>
        message.id === assistantMessage.id || message.status === "streaming"
          ? {
              ...message,
              status: aborted ? "cancelled" as const : "error" as const,
              content: aborted ? message.content : message.content || errorMessage,
            }
          : message
      ),
    }));
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
        set({ messages: [] });
      }
    } catch {
      set({ messages: [] });
    }
  },

  sendMessage: async (conversationId: string, content: string, attachments?: ChatAttachment[]) => {
    if (get().isStreaming) return;

    const userMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: "user",
      content,
      attachments: attachments?.length ? attachments : null,
      status: "success",
      createdAt: new Date(),
    };

    const assistantMessage: ChatMessage = {
      id: `temp-assistant-${Date.now()}`,
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
    const userMessage = currentMessages
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
      tokenUsage: null,
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
