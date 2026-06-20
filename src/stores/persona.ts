import { create } from "zustand";
import { toast } from "sonner";
import { authHeaders } from "@/lib/api-helpers";

export interface Persona {
  id: string;
  name: string;
  avatar: string;
  systemPrompt: string;
  recommendedModel: string | null;
  params: Record<string, unknown> | null;
  greeting: string | null;
  builtin: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PersonaState {
  personas: Persona[];
  loading: boolean;

  fetchPersonas: () => Promise<void>;
  createPersona: (data: Partial<Persona>) => Promise<void>;
  updatePersona: (id: string, data: Partial<Persona>) => Promise<void>;
  deletePersona: (id: string) => Promise<void>;
}

export const usePersonaStore = create<PersonaState>((set) => ({
  personas: [],
  loading: false,

  fetchPersonas: async () => {
    set({ loading: true });
    try {
      const res = await fetch("/api/personas", { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        set({ personas: data });
      }
    } finally {
      set({ loading: false });
    }
  },

  createPersona: async (data) => {
    try {
      const res = await fetch("/api/personas", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const persona = await res.json();
        set((state) => ({ personas: [...state.personas, persona] }));
      }
    } catch (error) {
      console.error("Failed to create persona:", error);
      toast.error("创建人格失败");
    }
  },

  updatePersona: async (id, data) => {
    try {
      const res = await fetch(`/api/personas/${id}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const updated = await res.json();
        set((state) => ({
          personas: state.personas.map((p) => (p.id === id ? { ...p, ...updated } : p)),
        }));
      }
    } catch (error) {
      console.error("Failed to update persona:", error);
      toast.error("更新人格失败");
    }
  },

  deletePersona: async (id) => {
    try {
      const res = await fetch(`/api/personas/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) return;
      set((state) => ({
        personas: state.personas.filter((p) => p.id !== id),
      }));
    } catch (error) {
      console.error("Failed to delete persona:", error);
      toast.error("删除人格失败");
    }
  },
}));
