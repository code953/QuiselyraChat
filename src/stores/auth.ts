import { create } from "zustand";
import { TOKEN_STORAGE_KEY } from "@/lib/api-helpers";

export interface LoginResult {
  ok: boolean;
  /** 服务端返回的提示（如触发限流时的等待时间），用于替代通用的「密码错误」文案 */
  message?: string;
}

interface AuthState {
  token: string | null;
  isAuthenticated: boolean;
  login: (password: string) => Promise<LoginResult>;
  logout: () => void;
  /** 从 localStorage 恢复 token，返回是否存在本地 token */
  initAuth: () => boolean;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  isAuthenticated: false,

  initAuth: () => {
    if (typeof window === "undefined") return false;
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (token) {
      set({ token, isAuthenticated: true });
      return true;
    }
    set({ token: null, isAuthenticated: false });
    return false;
  },

  login: async (password: string) => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        // 限流等情形有明确原因，直接透出给用户，避免误以为是密码错了
        return { ok: false, message: typeof data?.message === "string" ? data.message : undefined };
      }

      const { token } = await res.json();
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
      set({ token, isAuthenticated: true });
      return { ok: true };
    } catch {
      return { ok: false, message: "无法连接服务器，请稍后重试" };
    }
  },

  logout: () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    set({ token: null, isAuthenticated: false });
  },
}));
