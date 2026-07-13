import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { verifyAccessPassword, setAccessPassword } from "@/lib/secrets";
import { apiBadRequest, apiError } from "@/lib/api-helpers";

export const PUT = withAuth(async (req: NextRequest) => {
  const body = await req.json().catch(() => ({}));
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

  if (!newPassword) {
    return apiBadRequest("新密码不能为空");
  }
  if (newPassword.length < 6) {
    return apiBadRequest("新密码至少 6 个字符");
  }

  const valid = await verifyAccessPassword(currentPassword);
  if (!valid) {
    return apiError("UNAUTHORIZED", "当前密码不正确", 401);
  }

  await setAccessPassword(newPassword);
  return NextResponse.json({ success: true });
});
