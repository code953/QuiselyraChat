"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { FilePreview } from "@/components/file-preview";
import { useChatStore, type ChatAttachment } from "@/stores/chat";
import { useConversationStore } from "@/stores/conversation";
import { useModelStore } from "@/stores/model";
import { ModelSelector } from "@/components/model-selector";
import { PersonaSelector } from "@/components/persona-selector";
import { authHeaders, uploadFile } from "@/lib/api-helpers";
import { Send, Square, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { nanoid } from "nanoid";

const ALLOWED_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif"];
const ALLOWED_TEXT_EXTENSIONS = [
  ".txt", ".md", ".json", ".csv", ".py", ".js", ".ts", ".tsx", ".jsx",
  ".html", ".css", ".xml", ".yaml", ".yml", ".toml", ".sh", ".sql",
  ".c", ".cpp", ".h", ".java", ".go", ".rs", ".rb", ".php", ".log",
];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_TEXT_SIZE = 1 * 1024 * 1024;
const MAX_FILES = 5;

interface PendingFile {
  id: string;
  file: File;
  type: "image" | "text";
  previewUrl?: string;
  uploading: boolean;
  uploaded?: ChatAttachment;
  error?: boolean;
}

function getFileCategory(fileName: string): "image" | "text" | null {
  const ext = "." + (fileName.split(".").pop()?.toLowerCase() || "");
  if (ALLOWED_IMAGE_EXTENSIONS.includes(ext)) return "image";
  if (ALLOWED_TEXT_EXTENSIONS.includes(ext)) return "text";
  return null;
}

export function ChatInput() {
  const [input, setInput] = useState("");
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { sendMessage, isStreaming, stopGeneration } = useChatStore();
  const { currentId, createConversation, updateConversationTitle } = useConversationStore();
  const isFirstMessage = useChatStore((s) => s.messages.length === 0);
  const selectedModelId = useChatStore((s) => s.selectedModelId);
  const models = useModelStore((s) => s.models);

  const selectedModel = selectedModelId ? models.find((m) => m.id === selectedModelId) : null;
  const hasVision = Boolean(selectedModel?.capabilities?.vision);
  const hasImageFiles = pendingFiles.some((f) => f.type === "image");

  // 清理 object URLs
  useEffect(() => {
    return () => {
      pendingFiles.forEach((f) => {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, []);

  const addFile = useCallback(async (file: File) => {
    const category = getFileCategory(file.name);
    if (!category) {
      toast.error("不支持的文件类型");
      return;
    }
    if (category === "image" && file.size > MAX_IMAGE_SIZE) {
      toast.error("图片文件不能超过 10MB");
      return;
    }
    if (category === "text" && file.size > MAX_TEXT_SIZE) {
      toast.error("文本文件不能超过 1MB");
      return;
    }

    setPendingFiles((prev) => {
      if (prev.length >= MAX_FILES) {
        toast.error(`最多附加 ${MAX_FILES} 个文件`);
        return prev;
      }
      const id = nanoid(8);
      const previewUrl = category === "image" ? URL.createObjectURL(file) : undefined;
      const newFile: PendingFile = { id, file, type: category, previewUrl, uploading: true };
      return [...prev, newFile];
    });

    // 立即上传
    try {
      const result = await uploadFile(file);
      setPendingFiles((prev) =>
        prev.map((f) =>
          f.file === file
            ? { ...f, uploading: false, uploaded: { type: result.type, url: result.url, name: result.name, size: result.size } }
            : f
        )
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "上传失败";
      toast.error(msg);
      setPendingFiles((prev) =>
        prev.map((f) => (f.file === file ? { ...f, uploading: false, error: true } : f))
      );
    }
  }, []);

  const removeFile = useCallback((id: string) => {
    setPendingFiles((prev) => {
      const file = prev.find((f) => f.id === id);
      if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      files.forEach(addFile);
      e.target.value = "";
    },
    [addFile]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = Array.from(e.clipboardData.items);
      const imageItems = items.filter((item) => item.type.startsWith("image/"));
      if (imageItems.length > 0) {
        e.preventDefault();
        imageItems.forEach((item) => {
          const file = item.getAsFile();
          if (file) addFile(file);
        });
      }
    },
    [addFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        files.forEach(addFile);
      }
    },
    [addFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    // 检查是否有文件还在上传
    const stillUploading = pendingFiles.some((f) => f.uploading);
    if (stillUploading) {
      toast.warning("文件正在上传中，请稍候");
      return;
    }

    let convId = currentId;
    if (!convId) {
      const conv = await createConversation();
      if (!conv) return;
      convId = conv.id;
    }

    const shouldGenerateTitle = isFirstMessage;

    // 收集成功上传的附件
    const attachments: ChatAttachment[] = pendingFiles
      .filter((f) => f.uploaded && !f.error)
      .map((f) => f.uploaded!);

    setInput("");
    setPendingFiles([]);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    await sendMessage(convId, trimmed, attachments.length > 0 ? attachments : undefined);

    if (shouldGenerateTitle) {
      try {
        const res = await fetch(`/api/conversation-title?conversationId=${encodeURIComponent(convId)}`, {
          method: "POST",
          headers: authHeaders(),
        });
        if (res.ok) {
          const { title } = await res.json();
          updateConversationTitle(convId, title);
        }
      } catch {}
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const acceptTypes = [...ALLOWED_IMAGE_EXTENSIONS, ...ALLOWED_TEXT_EXTENSIONS]
    .map((ext) => ext)
    .join(",");

  return (
    <div className="border-t bg-background p-4">
      {/* Vision 能力警告 */}
      {hasImageFiles && !hasVision && selectedModel && (
        <div className="mx-auto mb-2 max-w-3xl rounded-md bg-yellow-50 px-3 py-1.5 text-xs text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200">
          当前模型未开启识图能力，将使用 OCR 模型识图。建议前往「设置 → 模型」为当前模型勾选识图能力，或前往「设置 → 通用」配置 OCR 模型。
        </div>
      )}

      <div
        className={cn(
          "mx-auto max-w-3xl rounded-lg border border-input focus-within:ring-1 focus-within:ring-ring",
          dragOver && "border-primary ring-1 ring-primary"
        )}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {/* 文件预览条 */}
        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 border-b px-3 py-2">
            {pendingFiles.map((f) => (
              <FilePreview
                key={f.id}
                name={f.file.name}
                type={f.type}
                previewUrl={f.previewUrl}
                uploading={f.uploading}
                error={f.error}
                onRemove={() => removeFile(f.id)}
              />
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            adjustHeight();
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="输入消息... (Shift+Enter 换行)"
          rows={1}
          className={cn(
            "w-full resize-none bg-transparent px-3 py-2 text-sm",
            "placeholder:text-muted-foreground focus-visible:outline-none",
            "min-h-[40px] max-h-[200px]"
          )}
        />
        <div className="flex items-center gap-1 px-2 pb-2">
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => fileInputRef.current?.click()}
              aria-label="上传文件"
              title="上传文件"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={acceptTypes}
              onChange={handleFileSelect}
              className="hidden"
            />
            <ModelSelector />
            <PersonaSelector />
          </div>
          {isStreaming ? (
            <Button
              onClick={stopGeneration}
              variant="destructive"
              size="icon"
              className="h-8 w-8 shrink-0"
              aria-label="停止生成"
            >
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSend}
              disabled={!input.trim()}
              size="icon"
              className="h-8 w-8 shrink-0"
              aria-label="发送"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
