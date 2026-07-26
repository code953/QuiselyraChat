import { mkdir, writeFile, readFile } from "fs/promises";
import path from "path";

// ---- 文件类型白名单 ----

export const ALLOWED_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif"];
export const ALLOWED_TEXT_EXTENSIONS = [
  ".txt", ".md", ".json", ".csv", ".py", ".js", ".ts", ".tsx", ".jsx",
  ".html", ".css", ".xml", ".yaml", ".yml", ".toml", ".sh", ".sql",
  ".c", ".cpp", ".h", ".java", ".go", ".rs", ".rb", ".php", ".log",
];

export const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
export const MAX_TEXT_SIZE = 1 * 1024 * 1024;   // 1MB

export type FileCategory = "image" | "text";

/**
 * 根据文件名判断文件类别（image/text），不在白名单中返回 null。
 */
export function getFileCategory(fileName: string): FileCategory | null {
  const ext = path.extname(fileName).toLowerCase();
  if (ALLOWED_IMAGE_EXTENSIONS.includes(ext)) return "image";
  if (ALLOWED_TEXT_EXTENSIONS.includes(ext)) return "text";
  return null;
}

/**
 * 验证上传文件的类型和大小，返回 { ok, error? }。
 */
export function validateUploadFile(fileName: string, size: number): { ok: boolean; error?: string } {
  const category = getFileCategory(fileName);
  if (!category) {
    return { ok: false, error: "不支持的文件类型" };
  }
  const maxSize = category === "image" ? MAX_IMAGE_SIZE : MAX_TEXT_SIZE;
  if (size > maxSize) {
    const limitMB = maxSize / (1024 * 1024);
    return { ok: false, error: `${category === "image" ? "图片" : "文本"}文件不能超过 ${limitMB}MB` };
  }
  return { ok: true };
}

/**
 * 按文件头（magic bytes）确认图片的真实类型，返回其扩展名族或 null。
 *
 * 仅凭扩展名判断类型意味着任何内容都能被起名为 .png 存进 uploads 并以
 * image/* 返回；此处对图片做内容校验，拒绝伪装文件。
 */
export function sniffImageExtension(data: Buffer): "png" | "jpeg" | "webp" | "gif" | null {
  if (data.length < 12) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47 &&
    data[4] === 0x0d && data[5] === 0x0a && data[6] === 0x1a && data[7] === 0x0a
  ) {
    return "png";
  }
  // JPEG: FF D8 FF
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "jpeg";
  // GIF: "GIF87a" / "GIF89a"
  if (data.subarray(0, 3).toString("latin1") === "GIF") return "gif";
  // WEBP: "RIFF" .... "WEBP"
  if (
    data.subarray(0, 4).toString("latin1") === "RIFF" &&
    data.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

const IMAGE_EXTENSION_FAMILY: Record<string, "png" | "jpeg" | "webp" | "gif"> = {
  ".png": "png",
  ".jpg": "jpeg",
  ".jpeg": "jpeg",
  ".webp": "webp",
  ".gif": "gif",
};

/**
 * 校验图片内容与其扩展名一致。文本类文件无需内容校验（统一以 text/plain 返回）。
 */
export function validateUploadContent(
  fileName: string,
  data: Buffer
): { ok: boolean; error?: string } {
  const ext = path.extname(fileName).toLowerCase();
  const expected = IMAGE_EXTENSION_FAMILY[ext];
  if (!expected) return { ok: true };

  const actual = sniffImageExtension(data);
  if (!actual) {
    return { ok: false, error: "文件内容不是有效的图片" };
  }
  if (actual !== expected) {
    return { ok: false, error: `文件内容（${actual}）与扩展名（${ext}）不一致` };
  }
  return { ok: true };
}

// ---- 上传文件存储 ----

// 上传文件根目录：./data/uploads（随 Docker ./data 卷持久化）
export function getUploadsDir(): string {
  return path.join(process.cwd(), "data", "uploads");
}

export async function ensureUploadsDir(): Promise<string> {
  const dir = getUploadsDir();
  await mkdir(dir, { recursive: true });
  return dir;
}

/**
 * 将二进制数据写入 uploads 目录，返回相对文件名（如 "abc123.png"）。
 */
export async function saveUpload(fileName: string, data: Buffer): Promise<string> {
  const dir = await ensureUploadsDir();
  await writeFile(path.join(dir, fileName), data);
  return fileName;
}

/**
 * 解析 uploads 目录下的安全绝对路径，阻止目录穿越。返回 null 表示非法。
 */
export function resolveUploadPath(relative: string): string | null {
  const dir = getUploadsDir();
  const resolved = path.resolve(dir, relative);
  const normalizedDir = path.resolve(dir);
  if (resolved !== normalizedDir && !resolved.startsWith(normalizedDir + path.sep)) {
    return null;
  }
  return resolved;
}

/**
 * 从 URL 路径（如 "/api/uploads/abc.png"）提取相对文件名。
 */
export function extractUploadFileName(url: string): string {
  return url.replace(/^\/api\/uploads\//, "");
}

/**
 * 读取上传文件的原始 Buffer。
 */
export async function readUploadBuffer(url: string): Promise<Buffer | null> {
  const fileName = extractUploadFileName(url);
  const resolved = resolveUploadPath(fileName);
  if (!resolved) return null;
  try {
    return await readFile(resolved);
  } catch {
    return null;
  }
}

/**
 * 将上传的图片读取为 data: URI（base64 编码），供 OpenAI Vision API 使用。
 */
export async function readUploadAsBase64DataUrl(url: string): Promise<string | null> {
  const fileName = extractUploadFileName(url);
  const ext = path.extname(fileName).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
  };
  const mime = mimeMap[ext] || "image/png";
  const buffer = await readUploadBuffer(url);
  if (!buffer) return null;
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

/**
 * 读取上传的文本文件内容（UTF-8）。
 */
export async function readUploadAsText(url: string): Promise<string | null> {
  const buffer = await readUploadBuffer(url);
  if (!buffer) return null;
  return buffer.toString("utf-8");
}
