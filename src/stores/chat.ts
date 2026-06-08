import { create } from "zustand";
import { authHeaders } from "@/lib/api-helpers";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  status: "success" | "error" | "cancelled" | "streaming";
  createdAt: Date;
  modelId?: string | null;
  tokenUsage?: { prompt: number; completion: number; total: number; cost?: number } | null;
}

type StreamEvent = {
  content?: string;
  messageId?: string;
  modelId?: string | null;
  usage?: ChatMessage["tokenUsage"];
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
  sendMessage: (conversationId: string, content: string) => Promise<void>;
  stopGeneration: () => void;
  clearMessages: () => void;
  setSelectedModelId: (modelId: string | null) => void;
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
          messages: data.map((m: Record<string, unknown>) => ({
            ...m,
            createdAt: new Date(m.createdAt as string | number),
            modelId: (m.modelId as string) || null,
            tokenUsage: (m.tokenUsage as ChatMessage["tokenUsage"]) || null,
          })),
        });
      } else {
        set({ messages: [] });
      }
    } catch {
      set({ messages: [] });
    }
  },

  sendMessage: async (conversationId: string, content: string) => {
    const userMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: "user",
      content,
      status: "success",
      createdAt: new Date(),
    };

    set((state) => ({
      messages: [...state.messages, userMessage],
    }));

    const abortController = new AbortController();
    set({ isStreaming: true, abortController });

    const assistantMessage: ChatMessage = {
      id: `temp-assistant-${Date.now()}`,
      role: "assistant",
      content: "",
      status: "streaming",
      createdAt: new Date(),
    };

    set((state) => ({
      messages: [...state.messages, assistantMessage],
    }));

    try {
      const { selectedModelId } = get();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          conversationId,
          content,
          ...(selectedModelId ? { modelId: selectedModelId } : {}),
        }),
        signal: abortController.signal,
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || "Failed to send message");
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
              messages: state.messages.map((m) =>
                m.id === activeAssistantId || m.id === assistantMessage.id
                  ? { ...m, id: activeAssistantId, status: "error" as const, content: m.content || data.error || "发送失败" }
                  : m
              ),
            }));
            break;
          }

          if (data.content) {
            set((state) => ({
              messages: state.messages.map((m) =>
                m.id === previousAssistantId || m.id === activeAssistantId || m.id === assistantMessage.id
                  ? { ...m, id: targetId, content: m.content + data.content, modelId: data.modelId || m.modelId }
                  : m
              ),
            }));
          }

          if (data.done) {
            set((state) => ({
              messages: state.messages.map((m) =>
                m.id === targetId || m.id === assistantMessage.id
                  ? { ...m, id: targetId, status: "success" as const, tokenUsage: data.usage || null }
                  : m
              ),
            }));
          }
        }

        if (done) break;
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") {
        set((state) => ({
          messages: state.messages.map((m) =>
            m.status === "streaming"
              ? { ...m, status: "cancelled" as const }
              : m
          ),
        }));
      } else {
        set((state) => ({
          messages: state.messages.map((m) =>
            m.status === "streaming"
              ? { ...m, status: "error" as const }
              : m
          ),
        }));
      }
    } finally {
      set({ isStreaming: false, abortController: null });
    }
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
