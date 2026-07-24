import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import { resolveUploadPath } from "@/lib/storage";

const CONTENT_TYPES: Record<string, string> = {
  // 图片
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  // 文本
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".py": "text/x-python; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".ts": "text/typescript; charset=utf-8",
  ".tsx": "text/typescript; charset=utf-8",
  ".jsx": "text/javascript; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".yaml": "text/yaml; charset=utf-8",
  ".yml": "text/yaml; charset=utf-8",
  ".toml": "text/toml; charset=utf-8",
  ".sh": "text/x-shellscript; charset=utf-8",
  ".sql": "text/x-sql; charset=utf-8",
  ".c": "text/x-c; charset=utf-8",
  ".cpp": "text/x-c++; charset=utf-8",
  ".h": "text/x-c; charset=utf-8",
  ".java": "text/x-java; charset=utf-8",
  ".go": "text/x-go; charset=utf-8",
  ".rs": "text/x-rust; charset=utf-8",
  ".rb": "text/x-ruby; charset=utf-8",
  ".php": "text/x-php; charset=utf-8",
  ".log": "text/plain; charset=utf-8",
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
