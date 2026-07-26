"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth";
import { authHeaders } from "@/lib/api-helpers";
import { Loader2 } from "lucide-react";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const initAuth = useAuthStore((s) => s.initAuth);
  const logout = useAuthStore((s) => s.logout);
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const hasToken = initAuth();
      if (!hasToken) {
        if (!cancelled) setChecking(false);
        return;
      }

      // 本地存在 token 不代表它仍然有效：可能已过期，或因修改访问密码而失效。
      // 向服务端确认一次，避免带着废 token 进入应用后每个接口各自报错。
      try {
        const res = await fetch("/api/auth/session", { headers: authHeaders() });
        if (!cancelled && res.status === 401) {
          logout();
        }
      } catch {
        // 网络异常时不强制登出，交由各接口自行处理
      }

      if (!cancelled) setChecking(false);
    };

    check();
    return () => {
      cancelled = true;
    };
  }, [initAuth, logout]);

  useEffect(() => {
    if (!checking && !isAuthenticated) {
      router.replace("/login");
    }
  }, [checking, isAuthenticated, router]);

  if (checking || !isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-label="加载中" />
      </div>
    );
  }

  return <>{children}</>;
}
