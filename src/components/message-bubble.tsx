"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { SearchCitations } from "@/components/search-citations";
import { Bot, User, Loader2, Copy, Check, RotateCcw, AlertCircle, Globe, FileText, Ban } from "lucide-react";
import { useModelStore } from "@/stores/model";
import { useChatStore, type ChatMessage } from "@/stores/chat";
import { cn } from "@/lib/utils";

interface MessageBubbleProps {
  message: ChatMessage;
  conversationId?: string | null;
}

function formatCost(cost: number): string {
  if (cost <= 0) return "";
  return cost < 0.01 ? `$${cost.toFixed(4)}` : `$${cost.toFixed(2)}`;
}

function MessageBubbleImpl({ message, conversationId }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isStreaming = message.status === "streaming";
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const retryGeneration = useChatStore((s) => s.retryGeneration);
  const isGenerating = useChatStore((s) => s.isStreaming);

  // 只订阅本条消息用到的模型名，而不是整个 models 数组
  const modelName = useModelStore((s) => {
    if (!message.modelId) return null;
    const model = s.models.find((m) => m.id === message.modelId);
    return model?.displayName || model?.modelId || null;
  });

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // 无剪贴板权限（非 HTTPS 等）时静默失败
    }
  }, [message.content]);

  const handleRetry = useCallback(() => {
    if (!conversationId || isGenerating) return;
    retryGeneration(conversationId, message.id);
  }, [conversationId, isGenerating, retryGeneration, message.id]);

  const canRetry = !isUser && !isStreaming && Boolean(conversationId);
  const cost = message.tokenUsage?.cost ? formatCost(message.tokenUsage.cost) : "";

  return (
    <div className={cn("group flex gap-3 px-3 py-3", isUser && "flex-row-reverse")}>
      <Avatar className="mt-0.5 h-8 w-8 shrink-0 ring-1 ring-border">
        <AvatarFallback
          className={cn(
            isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
          )}
        >
          {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </AvatarFallback>
      </Avatar>

      <div className={cn("flex min-w-0 flex-1 flex-col gap-1.5", isUser && "items-end")}>
        <div
          className={cn(
            "rounded-2xl text-sm",
            isUser
              ? "max-w-[85%] bg-primary px-3.5 py-2.5 text-primary-foreground shadow-sm"
              // 助手内容不再套色块：长回答铺满宽度时更易阅读
              : "w-full min-w-0 px-0.5 py-0.5"
          )}
        >
          {isUser ? (
            <>
              {message.attachments && message.attachments.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {message.attachments.map((att, i) =>
                    att.type === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={`${att.url}-${i}`}
                        src={att.url}
                        alt={att.name}
                        className="max-h-48 rounded-lg border border-white/20 object-contain"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <span
                        key={`${att.url}-${i}`}
                        className="inline-flex max-w-[14rem] items-center gap-1 rounded-md bg-background/20 px-2 py-0.5 text-xs"
                      >
                        <FileText className="h-3 w-3 shrink-0" />
                        <span className="truncate">{att.name}</span>
                      </span>
                    )
                  )}
                </div>
              )}
              <p className="whitespace-pre-wrap break-words">{message.content}</p>
            </>
          ) : (
            <>
              {message.searching && !message.content && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Globe className="h-3.5 w-3.5 animate-pulse" />
                  <span className="text-xs">正在联网搜索…</span>
                </div>
              )}
              {message.content ? (
                <div className={cn(isStreaming && "streaming-caret")}>
                  <MarkdownRenderer content={message.content} />
                </div>
              ) : isStreaming && !message.searching ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-xs">正在思考…</span>
                </div>
              ) : null}
            </>
          )}
        </div>

        {message.status === "error" && (
          <div className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            发送失败
          </div>
        )}
        {message.status === "cancelled" && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Ban className="h-3.5 w-3.5 shrink-0" />
            已停止生成
          </div>
        )}

        {!isUser && message.searchResults && message.searchResults.length > 0 && (
          <SearchCitations results={message.searchResults} />
        )}

        {/* 操作条置于消息下方：此前用绝对定位悬浮在气泡角上，会遮挡正文首行 */}
        {!isStreaming && (message.content || canRetry) && (
          <div
            className={cn(
              "flex items-center gap-0.5 opacity-0 transition-opacity duration-150",
              "group-hover:opacity-100 focus-within:opacity-100",
              isUser && "flex-row-reverse"
            )}
          >
            {message.content && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={handleCopy}
                title="复制内容"
                aria-label="复制内容"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            )}
            {canRetry && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                disabled={isGenerating}
                onClick={handleRetry}
                title="重新生成"
                aria-label="重新生成"
              >
                <RotateCcw className={cn("h-3.5 w-3.5", isGenerating && "animate-spin")} />
              </Button>
            )}
            {!isUser && (modelName || message.tokenUsage) && (
              <div className="ml-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                {modelName && <span className="max-w-[12rem] truncate">{modelName}</span>}
                {message.tokenUsage && <span>{message.tokenUsage.total} tokens</span>}
                {cost && <span>{cost}</span>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 流式输出期间 store 每收到一个 chunk 就重建 messages 数组，
 * 若不做记忆化，整个列表的所有气泡都会随之重渲染（并重跑 markdown 解析）。
 * 这里只在本条消息真正变化时才重渲染。
 */
export const MessageBubble = memo(MessageBubbleImpl, (prev, next) => {
  const a = prev.message;
  const b = next.message;
  return (
    prev.conversationId === next.conversationId &&
    a.id === b.id &&
    a.content === b.content &&
    a.status === b.status &&
    a.searching === b.searching &&
    a.modelId === b.modelId &&
    a.tokenUsage === b.tokenUsage &&
    a.searchResults === b.searchResults &&
    a.attachments === b.attachments
  );
});
