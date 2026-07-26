import { NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";

/**
 * GET /api/auth/session —— 校验当前 token 是否仍然有效。
 *
 * 令牌可能因过期、或因在设置中修改了访问密码（令牌版本变更）而失效。
 * 客户端在进入受保护页面时调用一次，失效则回到登录页，
 * 避免带着已失效的 token 让每个接口各自报错。
 */
export const GET = withAuth(async () => {
  return NextResponse.json({ authenticated: true });
});
