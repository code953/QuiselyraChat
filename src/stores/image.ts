import { create } from "zustand";
import { toast } from "sonner";
import { authHeaders } from "@/lib/api-helpers";

export interface GeneratedImage {
  id: string;
  prompt: string;
  modelId: string | null;
  provider: string | null;
  size: string | null;
  filePath: string;
  url: string;
  status: "success" | "error";
  createdAt: number;
}

interface ImageState {
  images: GeneratedImage[];
  loading: boolean;
  generating: boolean;
  fetchImages: () => Promise<void>;
  generateImage: (prompt: string, modelId: string, size: string) => Promise<GeneratedImage | null>;
  deleteImage: (id: string) => Promise<void>;
}

export const useImageStore = create<ImageState>((set) => ({
  images: [],
  loading: false,
  generating: false,

  fetchImages: async () => {
    set({ loading: true });
    try {
      const res = await fetch("/api/images", { headers: authHeaders() });
      if (res.ok) set({ images: await res.json() });
    } finally {
      set({ loading: false });
    }
  },

  generateImage: async (prompt, modelId, size) => {
    set({ generating: true });
    try {
      const res = await fetch("/api/images", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ prompt, modelId, size }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.message || "生成失败");
        return null;
      }
      set((state) => ({ images: [data, ...state.images] }));
      toast.success("图片已生成");
      return data;
    } catch {
      toast.error("生成失败");
      return null;
    } finally {
      set({ generating: false });
    }
  },

  deleteImage: async (id) => {
    try {
      const res = await fetch(`/api/images/${id}`, { method: "DELETE", headers: authHeaders() });
      if (res.ok) {
        set((state) => ({ images: state.images.filter((img) => img.id !== id) }));
      }
    } catch {
      toast.error("删除失败");
    }
  },
}));
