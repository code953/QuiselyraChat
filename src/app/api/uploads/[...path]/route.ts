import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import { resolveUploadPath } from "@/lib/storage";

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

// GET /api/uploads/<file> —— 公开读取（文件名为不可猜测的 nanoid）
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await context.params;
  const relative = (segments || []).join("/");
  const resolved = resolveUploadPath(relative);
  if (!resolved) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const buffer = await readFile(resolved);
    const ext = relative.slice(relative.lastIndexOf(".")).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || "application/octet-stream";
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
