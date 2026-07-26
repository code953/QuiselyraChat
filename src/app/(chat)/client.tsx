"use client";

import { useState } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/sidebar";
import { MessageList } from "@/components/message-list";
import { ChatInput } from "@/components/chat-input";
import { ConversationTitle } from "@/components/conversation-title";
import { ConversationActions } from "@/components/conversation-actions";
import { AuthGuard } from "@/components/auth-guard";
import { useConversationStore } from "@/stores/conversation";
import { Button } from "@/components/ui/button";
import { Menu, Settings } from "lucide-react";

function ChatPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const currentId = useConversationStore((s) => s.currentId);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-10 flex h-12 shrink-0 items-center gap-1 border-b bg-background/85 px-2 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 md:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="打开侧边栏"
          >
            <Menu className="h-4.5 w-4.5" />
          </Button>
          <div className="flex min-w-0 flex-1 items-center justify-center gap-1 overflow-hidden px-2">
            <ConversationTitle key={currentId ?? "none"} />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            asChild
            aria-label="设置"
          >
            <Link href="/settings" prefetch={false} title="设置">
              <Settings className="h-4 w-4" />
            </Link>
          </Button>
          <ConversationActions />
        </header>
        <MessageList />
        <ChatInput />
      </main>
    </div>
  );
}

export default function ChatPageClient() {
  return (
    <AuthGuard>
      <ChatPage />
    </AuthGuard>
  );
}
