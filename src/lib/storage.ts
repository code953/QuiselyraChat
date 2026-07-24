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
