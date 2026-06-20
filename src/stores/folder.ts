import { create } from "zustand";
import { toast } from "sonner";
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
    } catch (error) {
      console.error("Failed to create folder:", error);
      toast.error("创建文件夹失败");
    }
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
    } catch (error) {
      console.error("Failed to update folder:", error);
      toast.error("更新文件夹失败");
    }
  },

  deleteFolder: async (id) => {
    try {
      const res = await fetch(`/api/folders/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) return;
      set((state) => ({
        folders: state.folders.filter((f) => f.id !== id),
      }));
    } catch (error) {
      console.error("Failed to delete folder:", error);
      toast.error("删除文件夹失败");
    }
  },
}));
