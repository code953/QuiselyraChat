import { NextRequest } from "next/server";
import { stat } from "fs/promises";
import { createReadStream } from "fs";
import { Readable } from "stream";
import { extname } from "path";
import { resolveUploadPath } from "@/lib/storage";

/**
 * 仅图片按真实 MIME 返回。其余一律以 text/plain 返回。
 *
 * 上传白名单包含 .html / .js / .svg 之外的多种代码文本类型，若按真实 MIME
 * （如 text/html）在应用同源下返回，上传文件就成了同源脚本执行入口，可读取
 * localStorage 中的 JWT。统一降级为 text/plain，配合 nosniff 与 CSP sandbox
 * 消除该路径。
 */
const IMAGE_CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

const TEXT_CONTENT_TYPE = "text/plain; charset=utf-8";

// GET /api/uploads/<file> —— 公开读取（文件名为不可猜测的 nanoid）
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await context.params;
  const relative = (segments || []).join("/");
  const resolved = resolveUploadPath(relative);
  if (!resolved) {
    return new Response("Not found", { status: 404 });
  }

  const ext = extname(relative).toLowerCase();
  const imageType = IMAGE_CONTENT_TYPES[ext];
  const contentType = imageType || TEXT_CONTENT_TYPE;

  const headers = new Headers({
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=31536000, immutable",
    // 禁止浏览器按内容嗅探类型（防止伪装成 .png 的 HTML 被当作页面执行）
    "X-Content-Type-Options": "nosniff",
    // 即使被直接导航到，也不允许其中的脚本 / 外部请求生效
    "Content-Security-Policy": "default-src 'none'; img-src 'self'; sandbox",
  });

  try {
    const info = await stat(resolved);
    if (!info.isFile()) {
      return new Response("Not found", { status: 404 });
    }

    headers.set("Content-Length", String(info.size));
    headers.set("Last-Modified", info.mtime.toUTCString());

    // 弱 ETag 由 size + mtime 组成，配合协商缓存避免重复传输大图。
    const etag = `W/"${info.size.toString(16)}-${info.mtimeMs.toString(16)}"`;
    headers.set("ETag", etag);
    if (req.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304, headers });
    }

    // 流式返回，避免把整张图片读进内存
    const stream = Readable.toWeb(createReadStream(resolved)) as ReadableStream<Uint8Array>;
    return new Response(stream, { headers });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
