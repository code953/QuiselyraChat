import { NextRequest, NextResponse } from "next/server";
import { verifyPassword, signToken } from "@/lib/auth";
import { RateLimiter, clientKey } from "@/lib/rate-limit";

/**
 * 登录端点的暴力破解防护：
 * - 按来源 IP 限制：5 分钟内最多 5 次失败，之后按次数递增锁定（最长 15 分钟）。
 * - 另设全局闸门：防止攻击者轮换 IP / 伪造 XFF 绕过按 IP 的限制。
 */
const perClientLimiter = new RateLimiter({
  maxFailures: 5,
  windowMs: 5 * 60_000,
  baseLockMs: 60_000,
  maxLockMs: 15 * 60_000,
});

const globalLimiter = new RateLimiter({
  maxFailures: 30,
  windowMs: 5 * 60_000,
  baseLockMs: 30_000,
  maxLockMs: 5 * 60_000,
});

const GLOBAL_KEY = "__global__";

function tooManyRequests(retryAfterSeconds: number) {
  return NextResponse.json(
    {
      code: "TOO_MANY_REQUESTS",
      message: `尝试次数过多，请在 ${retryAfterSeconds} 秒后重试`,
    },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  );
}

export async function POST(req: NextRequest) {
  const key = clientKey(req);

  const clientState = perClientLimiter.check(key);
  if (!clientState.allowed) {
    return tooManyRequests(clientState.retryAfterSeconds);
  }
  const globalState = globalLimiter.check(GLOBAL_KEY);
  if (!globalState.allowed) {
    return tooManyRequests(globalState.retryAfterSeconds);
  }

  try {
    const body = await req.json().catch(() => null);
    const password = typeof body?.password === "string" ? body.password : "";

    if (!password) {
      return NextResponse.json(
        { code: "BAD_REQUEST", message: "Password is required" },
        { status: 400 }
      );
    }

    const valid = await verifyPassword(password);
    if (!valid) {
      const failure = perClientLimiter.recordFailure(key);
      globalLimiter.recordFailure(GLOBAL_KEY);
      if (!failure.allowed) {
        return tooManyRequests(failure.retryAfterSeconds);
      }
      return NextResponse.json(
        { code: "UNAUTHORIZED", message: "Invalid password" },
        { status: 401 }
      );
    }

    perClientLimiter.reset(key);
    const token = await signToken();
    return NextResponse.json({ token });
  } catch {
    return NextResponse.json(
      { code: "INTERNAL_ERROR", message: "Internal server error" },
      { status: 500 }
    );
  }
}
