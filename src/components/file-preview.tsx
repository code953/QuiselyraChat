"use client";

import { X, FileText, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface FilePreviewProps {
  name: string;
  type: "image" | "text";
  /** 字节数，缺省时只显示扩展名 */
  size?: number;
  previewUrl?: string;
  uploading?: boolean;
  error?: boolean;
  onRemove?: () => void;
  className?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FilePreview({
  name,
  type,
  size,
  previewUrl,
  uploading,
  error,
  onRemove,
  className,
}: FilePreviewProps) {
  const extension = name.split(".").pop()?.toUpperCase() || "";
  // 此前这里只显示扩展名却叫 formatSize，实际从未展示文件大小
  const meta = [extension, size !== undefined ? formatBytes(size) : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={cn(
        "relative flex w-44 items-center gap-2 rounded-lg border bg-background px-2 py-1.5 transition-colors",
        error && "border-destructive/60 bg-destructive/5",
        uploading && "opacity-70",
        className
      )}
    >
      {type === "image" && previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt={name}
          className="h-10 w-10 shrink-0 rounded-md object-cover"
          decoding="async"
        />
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
          {error ? (
            <AlertCircle className="h-5 w-5 text-destructive" />
          ) : (
            <FileText className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium" title={name}>
          {name}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {error ? "上传失败" : uploading ? "上传中…" : meta}
        </p>
      </div>

      {uploading && (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
      )}

      {onRemove && !uploading && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute -right-1.5 -top-1.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-foreground text-background shadow-sm transition-transform hover:scale-110"
          aria-label={`移除 ${name}`}
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  );
}
