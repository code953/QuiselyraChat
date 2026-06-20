import { create } from "zustand";
import { toast } from "sonner";
import { authHeaders } from "@/lib/api-helpers";

export interface ModelConfigWithCount {
  id: string;
  provider: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  modelsRefreshedAt: string | null;
  createdAt: string;
  modelCount: number;
}

interface ModelConfigState {
  configs: ModelConfigWithCount[];
  loading: boolean;

  fetchConfigs: () => Promise<void>;
  createConfig: (data: {
    provider: string;
    name: string;
    baseUrl: string;
    apiKey: string;
    params?: Record<string, unknown>;
  }) => Promise<void>;
  updateConfig: (id: string, data: Partial<{
    name: string;
    baseUrl: string;
    apiKey: string;
    enabled: boolean;
    params: Record<string, unknown>;
  }>) => Promise<void>;
  deleteConfig: (id: string) => Promise<void>;
  incrementModelCount: (id: string, count?: number) => void;
  setModelCount: (id: string, count: number) => void;
}

export const useModelConfigStore = create<ModelConfigState>((set) => ({
  configs: [],
  loading: false,

  fetchConfigs: async () => {
    set({ loading: true });
    try {
      const res = await fetch("/api/model-configs", { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        set({ configs: data });
      }
    } finally {
      set({ loading: false });
    }
  },

  createConfig: async (data) => {
    try {
      const res = await fetch("/api/model-configs", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const config = await res.json();
        set((state) => ({ configs: [...state.configs, config] }));
      }
    } catch (error) {
      console.error("Failed to create config:", error);
      toast.error("添加服务商失败");
    }
  },

  updateConfig: async (id, data) => {
    try {
      const res = await fetch(`/api/model-configs/${id}`, {
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
    } catch (error) {
      console.error("Failed to update config:", error);
      toast.error("更新服务商失败");
    }
  },

  deleteConfig: async (id) => {
    try {
      const res = await fetch(`/api/model-configs/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) return;
      set((state) => ({
        configs: state.configs.filter((c) => c.id !== id),
      }));
    } catch (error) {
      console.error("Failed to delete config:", error);
      toast.error("删除服务商失败");
    }
  },

  incrementModelCount: (id, count = 1) => {
    set((state) => ({
      configs: state.configs.map((config) =>
        config.id === id
          ? { ...config, modelCount: (Number(config.modelCount) || 0) + count }
          : config
      ),
    }));
  },

  setModelCount: (id, count) => {
    set((state) => ({
      configs: state.configs.map((config) =>
        config.id === id ? { ...config, modelCount: count } : config
      ),
    }));
  },
}));
