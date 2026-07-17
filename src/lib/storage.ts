import { mkdir, writeFile } from "fs/promises";
import path from "path";

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
