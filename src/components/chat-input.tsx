"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useChatStore } from "@/stores/chat";
import { useConversationStore } from "@/stores/conversation";
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
        const token = localStorage.getItem("nebulachat_token");
        const res = await fetch(`/api/conversations/${convId}/generate-title`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
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
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <div className="relative flex-1">
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
              "w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm",
              "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              "min-h-[40px] max-h-[200px]"
            )}
          />
        </div>
        {isStreaming ? (
          <Button
            onClick={stopGeneration}
            variant="destructive"
            size="icon"
            className="shrink-0"
          >
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={handleSend}
            disabled={!input.trim()}
            size="icon"
            className="shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
