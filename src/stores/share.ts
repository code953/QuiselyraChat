import { create } from "zustand";
import { toast } from "sonner";
import { authHeaders } from "@/lib/api-helpers";

export interface ShareTokenItem {
  id: string;
  token: string;
  conversationId: string;
  enabled: boolean;
  expiresAt: number | null;
  viewCount: number;
  createdAt: number;
}

interface ShareState {
  tokens: ShareTokenItem[];
  loading: boolean;
  fetchTokens: (conversationId: string) => Promise<void>;
  createToken: (conversationId: string, expiresInDays?: number) => Promise<ShareTokenItem | null>;
  toggleToken: (token: string, enabled: boolean) => Promise<void>;
  revokeToken: (token: string) => Promise<void>;
}

export const useShareStore = create<ShareState>((set) => ({
  tokens: [],
  loading: false,

  fetchTokens: async (conversationId) => {
    set({ loading: true });
    try {
      const res = await fetch(`/api/shares?conversationId=${encodeURIComponent(conversationId)}`, { headers: authHeaders() });
      if (res.ok) set({ tokens: await res.json() });
    } finally {
      set({ loading: false });
    }
  },

  createToken: async (conversationId, expiresInDays) => {
    try {
      const res = await fetch(`/api/shares`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ conversationId, expiresInDays: expiresInDays ?? null }),
      });
      if (res.ok) {
        const created = await res.json();
        set((state) => ({ tokens: [created, ...state.tokens] }));
        return created;
      }
      toast.error("创建分享链接失败");
      return null;
    } catch {
      toast.error("创建分享链接失败");
      return null;
    }
  },

  toggleToken: async (token, enabled) => {
    try {
      const res = await fetch(`/api/share/${token}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ enabled }),
      });
      if (res.ok) {
        set((state) => ({
          tokens: state.tokens.map((t) => (t.token === token ? { ...t, enabled } : t)),
        }));
      }
    } catch {
      toast.error("更新分享链接失败");
    }
  },

  revokeToken: async (token) => {
    try {
      const res = await fetch(`/api/share/${token}`, { method: "DELETE", headers: authHeaders() });
      if (res.ok) {
        set((state) => ({ tokens: state.tokens.filter((t) => t.token !== token) }));
      }
    } catch {
      toast.error("撤销分享链接失败");
    }
  },
}));
