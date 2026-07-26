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
import { Send, Square, Paperclip, AlertTriangle } from "lucide-react";
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
const MAX_TEXTAREA_HEIGHT = 200;
const ACCEPT_TYPES = [...ALLOWED_IMAGE_EXTENSIONS, ...ALLOWED_TEXT_EXTENSIONS].join(",");

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

  // 细粒度订阅，避免 messages 每次流式更新都重渲染输入区
  const sendMessage = useChatStore((s) => s.sendMessage);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const stopGeneration = useChatStore((s) => s.stopGeneration);
  const isFirstMessage = useChatStore((s) => s.messages.length === 0);
  const selectedModelId = useChatStore((s) => s.selectedModelId);

  const currentId = useConversationStore((s) => s.currentId);
  const createConversation = useConversationStore((s) => s.createConversation);
  const updateConversationTitle = useConversationStore((s) => s.updateConversationTitle);

  const hasVision = useModelStore((s) =>
    Boolean(selectedModelId && s.models.find((m) => m.id === selectedModelId)?.capabilities?.vision)
  );
  const hasSelectedModel = useModelStore((s) =>
    Boolean(selectedModelId && s.models.some((m) => m.id === selectedModelId))
  );

  const hasImageFiles = pendingFiles.some((f) => f.type === "image");
  const isUploading = pendingFiles.some((f) => f.uploading);

  // 卸载时释放预览用的 object URL。
  // 用 ref 持有最新列表：若直接依赖 pendingFiles 且依赖数组为空，
  // 清理函数会闭包到初始的空数组，实际什么都不会释放。
  const pendingFilesRef = useRef<PendingFile[]>([]);
  useEffect(() => {
    pendingFilesRef.current = pendingFiles;
  }, [pendingFiles]);
  useEffect(() => {
    return () => {
      pendingFilesRef.current.forEach((f) => {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      });
    };
  }, []);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
    }
  }, []);

  const addFile = useCallback(async (file: File) => {
    const category = getFileCategory(file.name);
    if (!category) {
      toast.error(`不支持的文件类型：${file.name}`);
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
    // 在入队前判断数量上限：此前把判断放在 setState 更新函数里，
    // 被拒绝的文件依然会发起上传，产生无法引用的孤儿文件。
    if (pendingFilesRef.current.length >= MAX_FILES) {
      toast.error(`最多附加 ${MAX_FILES} 个文件`);
      return;
    }

    const id = nanoid(8);
    const previewUrl = category === "image" ? URL.createObjectURL(file) : undefined;
    const entry: PendingFile = { id, file, type: category, previewUrl, uploading: true };
    pendingFilesRef.current = [...pendingFilesRef.current, entry];
    setPendingFiles((prev) => [...prev, entry]);

    // 立即上传
    try {
      const result = await uploadFile(file);
      setPendingFiles((prev) =>
        prev.map((f) =>
          f.id === id
            ? {
                ...f,
                uploading: false,
                uploaded: { type: result.type, url: result.url, name: result.name, size: result.size },
              }
            : f
        )
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "上传失败";
      toast.error(msg);
      setPendingFiles((prev) => prev.map((f) => (f.id === id ? { ...f, uploading: false, error: true } : f)));
    }
  }, []);

  const removeFile = useCallback((id: string) => {
    const removed = pendingFilesRef.current.find((f) => f.id === id);
    if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
    // 同步 ref，让紧随其后的 addFile 立即看到正确的数量
    pendingFilesRef.current = pendingFilesRef.current.filter((f) => f.id !== id);
    setPendingFiles((prev) => prev.filter((f) => f.id !== id));
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

    if (isUploading) {
      toast.warning("文件正在上传中，请稍候");
      return;
    }
    if (!hasSelectedModel) {
      toast.error("请先选择一个模型");
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

    // 清空前释放预览 URL，避免这些 blob 一直占用内存
    pendingFiles.forEach((f) => {
      if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
    });

    setInput("");
    setPendingFiles([]);
    pendingFilesRef.current = [];
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
    // 输入法组词过程中回车用于选字，不应触发发送
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="bg-background px-4 pb-4 pt-2">
      {/* Vision 能力警告 */}
      {hasImageFiles && !hasVision && hasSelectedModel && (
        <div className="mx-auto mb-2 flex max-w-3xl items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            当前模型未开启识图能力，将使用 OCR 模型识图。建议前往「设置 → 模型」为当前模型勾选识图能力，
            或前往「设置 → 通用」配置 OCR 模型。
          </span>
        </div>
      )}

      <div
        className={cn(
          "mx-auto max-w-3xl rounded-2xl border bg-card shadow-sm transition-all",
          "focus-within:border-ring/60 focus-within:shadow-md",
          dragOver && "border-primary bg-primary/5 ring-2 ring-primary/30"
        )}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {/* 文件预览条 */}
        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 border-b px-3 py-2.5">
            {pendingFiles.map((f) => (
              <FilePreview
                key={f.id}
                name={f.file.name}
                size={f.file.size}
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
          placeholder={dragOver ? "松手即可添加文件…" : "输入消息…（Enter 发送，Shift+Enter 换行）"}
          rows={1}
          aria-label="消息输入框"
          className={cn(
            "w-full resize-none bg-transparent px-3.5 pt-3 text-sm leading-6",
            "placeholder:text-muted-foreground focus-visible:outline-none",
            "min-h-[44px] max-h-[200px]"
          )}
        />
        <div className="flex items-center gap-1 px-2 pb-2">
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => fileInputRef.current?.click()}
              aria-label="上传文件"
              title="上传图片或文本文件"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPT_TYPES}
              onChange={handleFileSelect}
              className="hidden"
              tabIndex={-1}
            />
            <ModelSelector />
            <PersonaSelector />
          </div>
          {isStreaming ? (
            <Button
              onClick={stopGeneration}
              variant="destructive"
              size="icon"
              className="h-8 w-8 shrink-0 rounded-full"
              aria-label="停止生成"
              title="停止生成"
            >
              <Square className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isUploading}
              size="icon"
              className="h-8 w-8 shrink-0 rounded-full"
              aria-label="发送"
              title={isUploading ? "文件上传中…" : "发送消息"}
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
