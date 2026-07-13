"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useChatStore } from "@/stores/chat";
import { useConversationStore } from "@/stores/conversation";
import { ModelSelector } from "@/components/model-selector";
import { PersonaSelector } from "@/components/persona-selector";
import { authHeaders } from "@/lib/api-helpers";
import { Send, Square } from "lucide-react";
import { cn } from "@/lib/utils";

export function ChatInput() {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { sendMessage, isStreaming, stopGeneration } = useChatStore();
  const { currentId, createConversation, updateConversationTitle } = useConversationStore();
  const isFirstMessage = useChatStore((s) => s.messages.length === 0);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, []);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    let convId = currentId;
    if (!convId) {
      const conv = await createConversation();
      if (!conv) return;
      convId = conv.id;
    }

    const shouldGenerateTitle = isFirstMessage;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    await sendMessage(convId, trimmed);

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

  return (
    <div className="border-t bg-background p-4">
      <div className="mx-auto max-w-3xl rounded-lg border border-input focus-within:ring-1 focus-within:ring-ring">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            adjustHeight();
          }}
          onKeyDown={handleKeyDown}
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
