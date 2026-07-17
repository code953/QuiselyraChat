"use client";

import { useState } from "react";
import { toast } from "sonner";
import { authHeaders } from "@/lib/api-helpers";
import { conversationToMarkdown, downloadMarkdown, type ExportMessage } from "@/lib/export-markdown";
import { useConversationStore } from "@/stores/conversation";
import { ShareDialog } from "@/components/share-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Share2, FileDown, Globe } from "lucide-react";

export function ConversationActions() {
  const currentId = useConversationStore((s) => s.currentId);
  const conversations = useConversationStore((s) => s.conversations);
  const setSearchMode = useConversationStore((s) => s.setSearchMode);
  const [shareOpen, setShareOpen] = useState(false);

  if (!currentId) return null;

  const current = conversations.find((c) => c.id === currentId);
  const title = current?.title || "对话";
  const searchMode = current?.searchMode || "off";

  const handleExportMarkdown = async () => {
    try {
      const res = await fetch(`/api/conversation-messages?conversationId=${encodeURIComponent(currentId)}`, {
        headers: authHeaders(),
      });
      if (!res.ok) {
        toast.error("导出失败");
        return;
      }
      const messages = (await res.json()) as ExportMessage[];
      const md = conversationToMarkdown(title, messages);
      downloadMarkdown(title, md);
    } catch {
      toast.error("导出失败");
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="对话操作">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Globe className="h-4 w-4" />
              联网搜索
              <span className="ml-auto text-xs text-muted-foreground">
                {searchMode === "off" ? "关闭" : searchMode === "auto" ? "自动" : "强制"}
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuLabel>触发模式</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={searchMode}
                onValueChange={(v) => setSearchMode(currentId, v as "off" | "auto" | "forced")}
              >
                <DropdownMenuRadioItem value="off">关闭</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="auto">自动（模型自行决定）</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="forced">强制（每条先搜索）</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setShareOpen(true)}>
            <Share2 className="h-4 w-4" />
            分享链接
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleExportMarkdown}>
            <FileDown className="h-4 w-4" />
            导出 Markdown
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ShareDialog conversationId={currentId} open={shareOpen} onOpenChange={setShareOpen} />
    </>
  );
}
