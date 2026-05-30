import { create } from "zustand";
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
    } catch {}
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
    } catch {}
  },

  deleteConfig: async (id) => {
    try {
      await fetch(`/api/model-configs/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      set((state) => ({
        configs: state.configs.filter((c) => c.id !== id),
      }));
    } catch {}
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
}));
