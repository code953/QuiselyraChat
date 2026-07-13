"use client";

import { useEffect, useRef, useState } from "react";
import { useConversationStore } from "@/stores/conversation";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const DEFAULT_TITLE = "新对话";

export function ConversationTitle() {
  const currentId = useConversationStore((s) => s.currentId);
  const currentConv = useConversationStore((s) =>
    s.conversations.find((c) => c.id === s.currentId)
  );
  const updateConversationTitle = useConversationStore((s) => s.updateConversationTitle);

  const title = currentConv?.title?.trim() || DEFAULT_TITLE;
  const canEdit = Boolean(currentId);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const startEditing = () => {
    if (!canEdit) return;
    setDraft(currentConv?.title || "");
    setEditing(true);
  };

  const commit = async () => {
    if (!currentId) {
      setEditing(false);
      return;
    }
    const next = draft.trim();
    setEditing(false);
    if (next && next !== currentConv?.title) {
      await updateConversationTitle(currentId, next);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <Input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        maxLength={100}
        className="h-8 w-full max-w-xs text-sm"
        aria-label="重命名对话"
      />
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={startEditing}
            disabled={!canEdit}
            title={undefined}
            className={cn(
              "max-w-[60vw] truncate rounded px-2 py-1 text-sm font-medium sm:max-w-xs md:max-w-sm",
              canEdit
                ? "cursor-text hover:bg-accent hover:text-accent-foreground"
                : "cursor-default text-muted-foreground"
            )}
          >
            {title}
          </button>
        </TooltipTrigger>
        <TooltipContent>{canEdit ? `${title}（点击重命名）` : title}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
