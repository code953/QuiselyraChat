"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/stores/auth";
import { Lock, Loader2, Eye, EyeOff, AlertCircle } from "lucide-react";

export default function LoginClient() {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await login(password);
    if (result.ok) {
      router.replace("/");
    } else {
      setError(result.message || "密码错误，请重试");
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      {/* 背景光斑：纯色背景下登录页显得过于空旷 */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl"
      />

      <div className="relative w-full max-w-sm space-y-7">
        <div className="space-y-3 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border bg-card shadow-sm">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">QuiselyraChat</h1>
            <p className="text-sm text-muted-foreground">请输入访问密码</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="输入密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 pr-10"
              autoFocus
              autoComplete="current-password"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "login-error" : undefined}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
              aria-label={showPassword ? "隐藏密码" : "显示密码"}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {error && (
            <p
              id="login-error"
              role="alert"
              className="flex items-start gap-1.5 rounded-md bg-destructive/10 px-2.5 py-2 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}

          <Button type="submit" className="h-11 w-full" disabled={loading || !password}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            进入
          </Button>
        </form>

        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          首次使用？初始访问密码由系统在首次启动时自动生成，并打印在服务端启动日志中
          （查找「QuiselyraChat 初始访问密码」一行）。登录后可在「设置 - 通用」中修改密码。
        </p>
      </div>
    </div>
  );
}
