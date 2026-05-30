import { create } from "zustand";
import { authHeaders } from "@/lib/api-helpers";

export interface ModelWithProvider {
  id: string;
  modelConfigId: string;
  modelId: string;
  displayName: string | null;
  icon: string | null;
  contextWindow: number | null;
  pricing: { inputPer1k?: number; outputPer1k?: number } | null;
  capabilities: { chat: boolean; vision: boolean; tools: boolean; json: boolean; reasoning: boolean };
  paramsOverride: Record<string, unknown> | null;
  pinned: boolean;
  order: number;
  enabled: boolean;
  source: "fetched" | "manual";
  lastTestedAt: string | null;
  lastTestResult: Record<string, unknown> | null;
  providerName: string;
  providerBaseUrl: string;
  provider: string;
}

export type ModelCapabilityTestResult = {
  success: boolean;
  response?: string | null;
  error?: string;
  latencyMs?: number;
  tokens?: { prompt?: number; completion?: number; total?: number };
  hasToolCalls?: boolean;
};

export type ModelFullTestResult = {
  success: boolean;
  chat: ModelCapabilityTestResult;
  vision: ModelCapabilityTestResult;
  tools: ModelCapabilityTestResult;
  model?: ModelWithProvider;
};

interface ModelState {
  models: ModelWithProvider[];
  loading: boolean;

  fetchModels: (configId?: string) => Promise<void>;
  addModel: (data: Partial<ModelWithProvider>) => Promise<void>;
  updateModel: (id: string, data: Partial<ModelWithProvider>) => Promise<void>;
  deleteModel: (id: string) => Promise<void>;
  fetchRemoteModels: (configId: string) => Promise<unknown[]>;
  testModel: (id: string) => Promise<ModelFullTestResult | null>;
}

export const useModelStore = create<ModelState>((set) => ({
  models: [],
  loading: false,

  fetchModels: async (configId?: string) => {
    set({ loading: true });
    try {
      const url = configId ? `/api/models?configId=${configId}` : "/api/models";
      const res = await fetch(url, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        set({ models: data });
      }
    } finally {
      set({ loading: false });
    }
  },

  addModel: async (data) => {
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const model = await res.json();
        set((state) => ({ models: [...state.models, model] }));
      }
    } catch {}
  },

  updateModel: async (id, data) => {
    try {
      const res = await fetch(`/api/models/${id}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const updated = await res.json();
        set((state) => ({
          models: state.models.map((m) => (m.id === id ? { ...m, ...updated } : m)),
        }));
      }
    } catch {}
  },

  deleteModel: async (id) => {
    try {
      await fetch(`/api/models/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      set((state) => ({
        models: state.models.filter((m) => m.id !== id),
      }));
    } catch {}
  },

  fetchRemoteModels: async (configId: string) => {
    try {
      const res = await fetch(`/api/model-configs/${configId}/fetch-models`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (res.ok) {
        return await res.json();
      }
      return [];
    } catch {
      return [];
    }
  },

  testModel: async (id: string) => {
    try {
      const res = await fetch(`/api/models/${id}/test`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (res.ok) {
        const result = (await res.json()) as ModelFullTestResult;
        if (result.model) {
          set((state) => ({
            models: state.models.map((model) => (model.id === id ? { ...model, ...result.model } : model)),
          }));
        } else {
          set((state) => ({
            models: state.models.map((model) =>
              model.id === id ? { ...model, lastTestResult: result as unknown as Record<string, unknown> } : model
            ),
          }));
        }
        return result;
      }
      return null;
    } catch {
      return null;
    }
  },
}));
