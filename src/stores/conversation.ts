import { create } from "zustand";
import type { Conversation } from "@/db/schema";
import { authHeaders } from "@/lib/api-helpers";

export type ConversationWithPersona = Conversation & {
  personaName?: string | null;
  personaAvatar?: string | null;
};

interface ConversationState {
  conversations: ConversationWithPersona[];
  currentId: string | null;
  loading: boolean;

  fetchConversations: () => Promise<void>;
  createConversation: () => Promise<ConversationWithPersona | null>;
  deleteConversation: (id: string) => Promise<void>;
  setCurrentId: (id: string | null) => void;
  updateConversationTitle: (id: string, title: string) => void;
  pinConversation: (id: string, pinned: boolean) => Promise<void>;
  archiveConversation: (id: string, archived: boolean) => Promise<void>;
  moveToFolder: (id: string, folderId: string | null) => Promise<void>;
  setPersona: (id: string, personaId: string | null) => Promise<void>;
}

export const useConversationStore = create<ConversationState>((set) => ({
  conversations: [],
  currentId: null,
  loading: false,

  fetchConversations: async () => {
    set({ loading: true });
    try {
      const res = await fetch("/api/conversations", { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        set({ conversations: data });
      }
    } finally {
      set({ loading: false });
    }
  },

  createConversation: async () => {
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const conversation = await res.json();
        set((state) => ({
          conversations: [conversation, ...state.conversations],
          currentId: conversation.id,
        }));
        return conversation;
      }
      return null;
    } catch {
      return null;
    }
  },

  deleteConversation: async (id: string) => {
    try {
      await fetch(`/api/conversations/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      set((state) => ({
        conversations: state.conversations.filter((c) => c.id !== id),
        currentId: state.currentId === id ? null : state.currentId,
      }));
    } catch {}
  },

  setCurrentId: (id: string | null) => set({ currentId: id }),

  updateConversationTitle: (id: string, title: string) => {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, title } : c
      ),
    }));
  },

  pinConversation: async (id: string, pinned: boolean) => {
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ pinned }),
      });
      if (res.ok) {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, pinned } : c
          ),
        }));
      }
    } catch {}
  },

  archiveConversation: async (id: string, archived: boolean) => {
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ archived }),
      });
      if (res.ok) {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, archived } : c
          ),
        }));
      }
    } catch {}
  },

  moveToFolder: async (id: string, folderId: string | null) => {
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ folderId }),
      });
      if (res.ok) {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, folderId } : c
          ),
        }));
      }
    } catch {}
  },

  setPersona: async (id: string, personaId: string | null) => {
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ personaId }),
      });
      if (res.ok) {
        const updated = await res.json();
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, ...updated } : c
          ),
        }));
      }
    } catch {}
  },
}));
