"use client";

import { useEffect, useRef } from "react";
import { MessageBubble } from "@/components/message-bubble";
import { useChatStore } from "@/stores/chat";
import { useConversationStore } from "@/stores/conversation";
import { MessageSquare } from "lucide-react";

export function MessageList() {
  const { messages, isStreaming } = useChatStore();
  const currentId = useConversationStore((s) => s.currentId);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted-foreground">
        <MessageSquare className="h-12 w-12" />
        <div className="text-center">
          <h3 className="text-lg font-medium">NekoraChat</h3>
          <p className="text-sm">开始一段新的对话吧</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl py-4">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} conversationId={currentId} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
