"use client";

import { X, FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface FilePreviewProps {
  name: string;
  type: "image" | "text";
  previewUrl?: string;
  uploading?: boolean;
  error?: boolean;
  onRemove?: () => void;
  className?: string;
}

export function FilePreview({ name, type, previewUrl, uploading, error, onRemove, className }: FilePreviewProps) {
  const formatSize = (name: string) => {
    // 从文件名中取扩展名作为标签
    const ext = name.split(".").pop()?.toUpperCase() || "";
    return ext;
  };

  return (
    <div
      className={cn(
        "relative flex items-center gap-2 rounded-md border px-2 py-1.5",
        error && "border-destructive bg-destructive/5",
        uploading && "opacity-60",
        className
      )}
    >
      {type === "image" && previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt={name}
          className="h-10 w-10 shrink-0 rounded object-cover"
        />
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted">
          <FileText className="h-5 w-5 text-muted-foreground" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{name}</p>
        <p className="text-[10px] text-muted-foreground">{formatSize(name)}</p>
      </div>

      {uploading && (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
      )}

      {onRemove && !uploading && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-foreground/80 text-background hover:bg-foreground"
          aria-label="移除文件"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  );
}
