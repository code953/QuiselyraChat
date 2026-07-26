"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MessageBubble } from "@/components/message-bubble";
import { useChatStore } from "@/stores/chat";
import { useConversationStore } from "@/stores/conversation";
import { Button } from "@/components/ui/button";
import { ArrowDown, MessageSquare, Sparkles } from "lucide-react";

/** 距底部小于该像素数即视为「贴底」，此时才自动跟随新内容 */
const STICK_THRESHOLD = 96;

export function MessageList() {
  // 细粒度订阅：避免 isStreaming / selectedModelId 等无关字段变化引起整列表重渲染
  const messages = useChatStore((s) => s.messages);
  const currentId = useConversationStore((s) => s.currentId);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [stuckToBottom, setStuckToBottom] = useState(true);
  // 用 ref 保存贴底状态供滚动副作用读取，避免把它写进依赖里
  const stuckRef = useRef(true);
  const rafRef = useRef<number | null>(null);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distance <= STICK_THRESHOLD;
    stuckRef.current = atBottom;
    setStuckToBottom((prev) => (prev === atBottom ? prev : atBottom));
  }, []);

  // 内容增长时跟随到底部。
  // 关键点：使用 scrollTop 直接赋值而非 behavior "smooth"——流式输出每秒会产生
  // 几十次内容更新，逐次触发平滑滚动动画会互相打断并造成明显掉帧。
  // 同时用 rAF 合并同一帧内的多次更新。
  const prevConversationRef = useRef(currentId);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    // 切换会话时重新贴底
    if (prevConversationRef.current !== currentId) {
      prevConversationRef.current = currentId;
      stuckRef.current = true;
    }
    if (!stuckRef.current) return;

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      el.scrollTop = el.scrollHeight;
      // 内容不足以滚动时不会触发 scroll 事件，这里显式同步按钮可见性
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      setStuckToBottom(distance <= STICK_THRESHOLD);
    });
  }, [messages, currentId]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    stuckRef.current = true;
    setStuckToBottom(true);
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6">
        <div className="relative">
          <div
            aria-hidden
            className="absolute inset-0 -m-4 rounded-full bg-primary/10 blur-xl"
          />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border bg-card shadow-sm">
            <MessageSquare className="h-7 w-7 text-primary" />
          </div>
        </div>
        <div className="max-w-md space-y-1.5 text-center">
          <h3 className="text-xl font-semibold tracking-tight">QuiselyraChat</h3>
          <p className="text-sm text-muted-foreground">
            开始一段新的对话，或从左侧选择历史会话
          </p>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" />
          支持多模型、联网搜索与文件附件
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto overscroll-contain"
      >
        <div className="mx-auto max-w-3xl px-1 py-6">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} conversationId={currentId} />
          ))}
        </div>
      </div>

      {!stuckToBottom && (
        <Button
          variant="outline"
          size="icon"
          onClick={scrollToBottom}
          aria-label="回到最新消息"
          title="回到最新消息"
          className="absolute bottom-4 left-1/2 h-9 w-9 -translate-x-1/2 rounded-full shadow-md backdrop-blur transition-opacity"
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
