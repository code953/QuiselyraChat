import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "./auth";

export function withAuth(
  handler: (req: NextRequest, context: { params: Promise<Record<string, string>> }) => Promise<Response>
) {
  return async (req: NextRequest, context: { params: Promise<Record<string, string>> }) => {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ code: "UNAUTHORIZED", message: "Missing token" }, { status: 401 });
    }

    const token = authHeader.slice(7);
    if (!(await verifyToken(token))) {
      return NextResponse.json({ code: "UNAUTHORIZED", message: "Invalid token" }, { status: 401 });
    }

    return handler(req, context);
  };
}
