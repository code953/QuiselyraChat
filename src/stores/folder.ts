import { create } from "zustand";
import { authHeaders } from "@/lib/api-helpers";

export interface Folder {
  id: string;
  name: string;
  order: number;
}

interface FolderState {
  folders: Folder[];
  loading: boolean;

  fetchFolders: () => Promise<void>;
  createFolder: (name: string) => Promise<void>;
  updateFolder: (id: string, data: Partial<{ name: string; order: number }>) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
}

export const useFolderStore = create<FolderState>((set) => ({
  folders: [],
  loading: false,

  fetchFolders: async () => {
    set({ loading: true });
    try {
      const res = await fetch("/api/folders", { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        set({ folders: data });
      }
    } finally {
      set({ loading: false });
    }
  },

  createFolder: async (name: string) => {
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const folder = await res.json();
        set((state) => ({ folders: [...state.folders, folder] }));
      }
    } catch {}
  },

  updateFolder: async (id, data) => {
    try {
      const res = await fetch(`/api/folders/${id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const updated = await res.json();
        set((state) => ({
          folders: state.folders.map((f) => (f.id === id ? { ...f, ...updated } : f)),
        }));
      }
    } catch {}
  },

  deleteFolder: async (id) => {
    try {
      await fetch(`/api/folders/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      set((state) => ({
        folders: state.folders.filter((f) => f.id !== id),
      }));
    } catch {}
  },
}));
