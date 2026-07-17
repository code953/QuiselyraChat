import { create } from "zustand";
import { toast } from "sonner";
import { authHeaders } from "@/lib/api-helpers";

export interface SearchConfigItem {
  id: string;
  provider: string;
  name: string;
  baseUrl: string | null;
  kind: "function" | "native";
  enabled: boolean;
  createdAt: number;
}

interface SearchConfigState {
  configs: SearchConfigItem[];
  activeConfigId: string | null;
  loading: boolean;
  fetchConfigs: () => Promise<void>;
  fetchActive: () => Promise<void>;
  createConfig: (data: { provider: string; name: string; baseUrl?: string; apiKey?: string }) => Promise<boolean>;
  updateConfig: (id: string, data: Partial<{ name: string; baseUrl: string; apiKey: string; enabled: boolean }>) => Promise<void>;
  deleteConfig: (id: string) => Promise<void>;
  setActive: (configId: string | null) => Promise<void>;
}

export const useSearchConfigStore = create<SearchConfigState>((set) => ({
  configs: [],
  activeConfigId: null,
  loading: false,

  fetchConfigs: async () => {
    set({ loading: true });
    try {
      const res = await fetch("/api/search-configs", { headers: authHeaders() });
      if (res.ok) set({ configs: await res.json() });
    } finally {
      set({ loading: false });
    }
  },

  fetchActive: async () => {
    try {
      const res = await fetch("/api/settings/active-search-config", { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        set({ activeConfigId: data.configId || null });
      }
    } catch {
      // 忽略
    }
  },

  createConfig: async (data) => {
    try {
      const res = await fetch("/api/search-configs", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(data),
      });
      const created = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(created?.message || "创建失败");
        return false;
      }
      set((state) => ({ configs: [created, ...state.configs] }));
      return true;
    } catch {
      toast.error("创建失败");
      return false;
    }
  },

  updateConfig: async (id, data) => {
    try {
      const res = await fetch(`/api/search-configs/${id}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const updated = await res.json();
        set((state) => ({
          configs: state.configs.map((c) => (c.id === id ? { ...c, ...updated } : c)),
        }));
      }
    } catch {
      toast.error("更新失败");
    }
  },

  deleteConfig: async (id) => {
    try {
      const res = await fetch(`/api/search-configs/${id}`, { method: "DELETE", headers: authHeaders() });
      if (res.ok) {
        set((state) => ({
          configs: state.configs.filter((c) => c.id !== id),
          activeConfigId: state.activeConfigId === id ? null : state.activeConfigId,
        }));
      }
    } catch {
      toast.error("删除失败");
    }
  },

  setActive: async (configId) => {
    try {
      const res = await fetch("/api/settings/active-search-config", {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ configId }),
      });
      if (res.ok) set({ activeConfigId: configId });
    } catch {
      toast.error("设置失败");
    }
  },
}));
