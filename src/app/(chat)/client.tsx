"use client";

import { useState } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/sidebar";
import { MessageList } from "@/components/message-list";
import { ChatInput } from "@/components/chat-input";
import { ModelSelector } from "@/components/model-selector";
import { PersonaSelector } from "@/components/persona-selector";
import { AuthGuard } from "@/components/auth-guard";
import { Button } from "@/components/ui/button";
import { Menu, Settings } from "lucide-react";

function ChatPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center border-b px-2 py-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex flex-1 items-center justify-center gap-1">
            <ModelSelector />
            <PersonaSelector />
          </div>
          <Button variant="ghost" size="icon" asChild>
            <Link href="/settings" prefetch={false}>
              <Settings className="h-4 w-4" />
            </Link>
          </Button>
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
