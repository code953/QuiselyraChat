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

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("nebulachat_token");
}

export function authHeaders(): Record<string, string> {
  const token = getToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
