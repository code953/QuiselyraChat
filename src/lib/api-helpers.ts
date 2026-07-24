import { NextResponse } from "next/server";

export function apiError(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

export function apiBadRequest(message: string) {
  return apiError("BAD_REQUEST", message, 400);
}

export function apiNotFound(message = "Resource not found") {
  return apiError("NOT_FOUND", message, 404);
}

export function apiServerError(message = "Internal server error") {
  return apiError("INTERNAL_ERROR", message, 500);
}

export function stripSensitiveFields<T extends Record<string, unknown>>(obj: T): Omit<T, "apiKeyEncrypted"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { apiKeyEncrypted, ...rest } = obj;
  return rest as Omit<T, "apiKeyEncrypted">;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("quiselyrachat_token");
}

export function authHeaders(): Record<string, string> {
  const token = getToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * 只含 Authorization 头，不设 Content-Type（FormData 上传需要浏览器自动设置 boundary）。
 */
export function authHeadersRaw(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type UploadResult = { url: string; name: string; size: number; type: "image" | "text" };

/**
 * 上传单个文件到 /api/upload，返回文件元数据。
 */
export async function uploadFile(file: File): Promise<UploadResult> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: authHeadersRaw(),
    body: formData,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "上传失败");
  }
  return res.json();
}
