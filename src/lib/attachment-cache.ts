import { readUploadAsBase64DataUrl, readUploadAsText } from "./storage";

/**
 * 上传附件的进程内缓存。
 *
 * 上传文件名是 nanoid 且写入后不再修改，因此内容可安全长期缓存。
 * 没有缓存时，每次发送消息都要把整段历史里的每个附件重新读盘 + 重新 base64
 * 编码——一段带 5 张图的对话，每轮都要重复十几 MB 的 I/O 与编码。
 *
 * 用带字节预算的 LRU 约束内存占用（base64 后体积约为原文件的 4/3）。
 */

const MAX_CACHE_BYTES = 64 * 1024 * 1024;

interface Entry {
  value: string;
  bytes: number;
}

class ByteBudgetLru {
  // Map 的插入顺序即访问顺序：命中时删除再插入把条目移到末尾
  private readonly entries = new Map<string, Entry>();
  private totalBytes = 0;

  constructor(private readonly maxBytes: number) {}

  get(key: string): string | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: string): void {
    const bytes = value.length;
    // 单个条目就超过预算时不缓存，避免立刻把其它条目全部挤出
    if (bytes > this.maxBytes) return;

    const existing = this.entries.get(key);
    if (existing) {
      this.totalBytes -= existing.bytes;
      this.entries.delete(key);
    }

    this.entries.set(key, { value, bytes });
    this.totalBytes += bytes;

    while (this.totalBytes > this.maxBytes) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      const evicted = this.entries.get(oldest.value);
      this.entries.delete(oldest.value);
      if (evicted) this.totalBytes -= evicted.bytes;
    }
  }
}

const imageDataUrlCache = new ByteBudgetLru(MAX_CACHE_BYTES);
const textContentCache = new ByteBudgetLru(MAX_CACHE_BYTES / 8);

/** 读取图片为 data: URL，命中缓存则跳过磁盘 I/O 与 base64 编码。 */
export async function getImageDataUrl(url: string): Promise<string | null> {
  const cached = imageDataUrlCache.get(url);
  if (cached !== undefined) return cached;

  const dataUrl = await readUploadAsBase64DataUrl(url);
  if (dataUrl) imageDataUrlCache.set(url, dataUrl);
  return dataUrl;
}

/** 读取文本附件内容，命中缓存则跳过磁盘 I/O。 */
export async function getTextContent(url: string): Promise<string | null> {
  const cached = textContentCache.get(url);
  if (cached !== undefined) return cached;

  const text = await readUploadAsText(url);
  if (text) textContentCache.set(url, text);
  return text;
}
