import { create } from "zustand";

interface AuthState {
  token: string | null;
  isAuthenticated: boolean;
  login: (password: string) => Promise<boolean>;
  logout: () => void;
  initAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  isAuthenticated: false,

  initAuth: () => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("nekorachat_token") || localStorage.getItem("nebulachat_token");
    if (token) {
      set({ token, isAuthenticated: true });
    }
  },

  login: async (password: string) => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) return false;

      const { token } = await res.json();
      localStorage.setItem("nekorachat_token", token);
      localStorage.removeItem("nebulachat_token");
      set({ token, isAuthenticated: true });
      return true;
    } catch {
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem("nekorachat_token");
    localStorage.removeItem("nebulachat_token");
    set({ token: null, isAuthenticated: false });
  },
}));
