"use client";

import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { Bot, User, Loader2, Copy, Check } from "lucide-react";
import { useModelStore } from "@/stores/model";
import type { ChatMessage } from "@/stores/chat";
import { cn } from "@/lib/utils";

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isStreaming = message.status === "streaming";
  const [copied, setCopied] = useState(false);

  const models = useModelStore((s) => s.models);
  const model = message.modelId
    ? models.find((m) => m.id === message.modelId)
    : null;
  const modelName = model?.displayName || model?.modelId;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn("group flex gap-3 px-4 py-3", isUser && "flex-row-reverse")}>
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className={cn(isUser ? "bg-primary text-primary-foreground" : "bg-muted")}>
          {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </AvatarFallback>
      </Avatar>
      <div className={cn("flex-1 space-y-1 overflow-hidden", isUser && "flex flex-col items-end")}>
        <div
          className={cn(
            "relative rounded-lg px-3 py-2 text-sm",
            isUser
              ? "bg-primary text-primary-foreground max-w-[80%] inline-block"
              : "bg-muted max-w-full"
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <>
              {message.content ? (
                <MarkdownRenderer content={message.content} />
              ) : isStreaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
            </>
          )}
          {message.content && !isStreaming && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute -right-1 -top-1 h-6 w-6 opacity-0 group-hover:opacity-100"
              onClick={handleCopy}
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </Button>
          )}
        </div>
        {message.status === "error" && (
          <span className="text-xs text-destructive">发送失败</span>
        )}
        {!isUser && !isStreaming && (modelName || message.tokenUsage) && (
          <div className="flex items-center gap-2 px-1">
            {modelName && (
              <span className="text-[11px] text-muted-foreground">{modelName}</span>
            )}
            {message.tokenUsage && (
              <span className="text-[11px] text-muted-foreground">
                {message.tokenUsage.total} tokens
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
