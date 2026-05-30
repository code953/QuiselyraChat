"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConversationStore, type ConversationWithPersona } from "@/stores/conversation";
import { useChatStore } from "@/stores/chat";
import { useAuthStore } from "@/stores/auth";
import { useFolderStore } from "@/stores/folder";
import {
  Plus,
  MessageSquare,
  LogOut,
  X,
  Settings,
  Pin,
  Archive,
  Trash2,
  Pencil,
  FolderPlus,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  PinOff,
  ArchiveRestore,
  FolderMinus,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

function ConversationItem({
  conv,
  isActive,
  onSelect,
  folders,
  onRename,
  onPin,
  onArchive,
  onMoveToFolder,
  onDelete,
}: {
  conv: ConversationWithPersona;
  isActive: boolean;
  onSelect: () => void;
  folders: { id: string; name: string }[];
  onRename: (id: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onArchive: (id: string, archived: boolean) => void;
  onMoveToFolder: (id: string, folderId: string | null) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={cn(
        "group flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent",
        isActive && "bg-sidebar-accent"
      )}
    >
      <MessageSquare className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">
        {conv.pinned && "📌 "}
        {conv.title}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="right">
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onRename(conv.id); }}>
            <Pencil className="h-4 w-4" />
            重命名
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onPin(conv.id, !conv.pinned); }}>
            {conv.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            {conv.pinned ? "取消置顶" : "置顶"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onArchive(conv.id, !conv.archived); }}>
            {conv.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            {conv.archived ? "取消归档" : "归档"}
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger onClick={(e) => e.stopPropagation()}>
              <FolderOpen className="h-4 w-4" />
              移到文件夹
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onMoveToFolder(conv.id, null); }}>
                <FolderMinus className="h-4 w-4" />
                未分类
              </DropdownMenuItem>
              {folders.map((f) => (
                <DropdownMenuItem key={f.id} onClick={(e) => { e.stopPropagation(); onMoveToFolder(conv.id, f.id); }}>
                  <FolderOpen className="h-4 w-4" />
                  {f.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}>
            <Trash2 className="h-4 w-4" />
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const {
    conversations,
    currentId,
    fetchConversations,
    createConversation,
    deleteConversation,
    setCurrentId,
    updateConversationTitle,
    pinConversation,
    archiveConversation,
    moveToFolder,
  } = useConversationStore();
  const { fetchMessages, clearMessages } = useChatStore();
  const { logout } = useAuthStore();
  const { folders, fetchFolders, createFolder, deleteFolder } = useFolderStore();

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchConversations();
    fetchFolders();
  }, [fetchConversations, fetchFolders]);

  const pinnedConvs = useMemo(
    () => conversations.filter((c) => c.pinned && !c.archived),
    [conversations]
  );

  const archivedConvs = useMemo(
    () => conversations.filter((c) => c.archived),
    [conversations]
  );

  const uncategorized = useMemo(
    () => conversations.filter((c) => !c.pinned && !c.archived && !c.folderId),
    [conversations]
  );

  const folderConvs = useMemo(() => {
    const map = new Map<string, ConversationWithPersona[]>();
    for (const f of folders) {
      map.set(
        f.id,
        conversations.filter((c) => c.folderId === f.id && !c.pinned && !c.archived)
      );
    }
    return map;
  }, [conversations, folders]);

  const handleSelect = (id: string) => {
    setCurrentId(id);
    fetchMessages(id);
    onClose();
  };

  const handleNew = async () => {
    const conv = await createConversation();
    if (conv) {
      clearMessages();
    }
  };

  const handleRename = (id: string) => {
    const conv = conversations.find((c) => c.id === id);
    if (conv) {
      setRenamingId(id);
      setRenameValue(conv.title);
    }
  };

  const handleRenameSubmit = (id: string) => {
    const trimmed = renameValue.trim();
    if (trimmed) {
      updateConversationTitle(id, trimmed);
    }
    setRenamingId(null);
  };

  const handleDelete = async (id: string) => {
    await deleteConversation(id);
    if (currentId === id) {
      clearMessages();
    }
  };

  const handleCreateFolder = () => {
    const trimmed = newFolderName.trim();
    if (trimmed) {
      createFolder(trimmed);
      setNewFolderName("");
      setCreatingFolder(false);
    }
  };

  const toggleFolder = (folderId: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const renderConversation = (conv: ConversationWithPersona) => {
    if (renamingId === conv.id) {
      return (
        <div key={conv.id} className="flex items-center gap-1 px-2 py-1">
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRenameSubmit(conv.id);
              if (e.key === "Escape") setRenamingId(null);
            }}
            onBlur={() => handleRenameSubmit(conv.id)}
            className="h-7 text-sm"
            autoFocus
          />
        </div>
      );
    }
    return (
      <ConversationItem
        key={conv.id}
        conv={conv}
        isActive={currentId === conv.id}
        onSelect={() => handleSelect(conv.id)}
        folders={folders}
        onRename={handleRename}
        onPin={pinConversation}
        onArchive={archiveConversation}
        onMoveToFolder={moveToFolder}
        onDelete={handleDelete}
      />
    );
  };

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={onClose} />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-sidebar text-sidebar-foreground transition-transform md:relative md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between border-b p-3">
          <h1 className="text-lg font-semibold">NekoraChat</h1>
          <Button variant="ghost" size="icon" className="md:hidden" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex gap-1 p-2">
          <Button onClick={handleNew} variant="outline" className="flex-1 justify-start gap-2">
            <Plus className="h-4 w-4" />
            新对话
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCreatingFolder(true)}
          >
            <FolderPlus className="h-4 w-4" />
          </Button>
        </div>

        {creatingFolder && (
          <div className="flex items-center gap-1 px-2 pb-2">
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateFolder();
                if (e.key === "Escape") { setCreatingFolder(false); setNewFolderName(""); }
              }}
              onBlur={() => { if (!newFolderName.trim()) { setCreatingFolder(false); } else { handleCreateFolder(); } }}
              placeholder="文件夹名称"
              className="h-7 text-sm"
              autoFocus
            />
          </div>
        )}

        <ScrollArea className="flex-1">
          <div className="space-y-1 p-2">
            {pinnedConvs.length > 0 && (
              <div className="mb-2">
                <div className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-muted-foreground">
                  <Pin className="h-3 w-3" />
                  置顶
                </div>
                {pinnedConvs.map(renderConversation)}
              </div>
            )}

            {folders.map((folder) => {
              const items = folderConvs.get(folder.id) || [];
              const isCollapsed = collapsedFolders.has(folder.id);
              return (
                <div key={folder.id} className="mb-2">
                  <div className="group flex items-center gap-1 px-2 py-1 text-xs font-medium text-muted-foreground">
                    <button
                      className="flex flex-1 items-center gap-1"
                      onClick={() => toggleFolder(folder.id)}
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                      <FolderOpen className="h-3 w-3" />
                      <span className="truncate">{folder.name}</span>
                      <span className="text-[10px]">({items.length})</span>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 opacity-0 group-hover:opacity-100"
                      onClick={() => deleteFolder(folder.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  {!isCollapsed && items.map(renderConversation)}
                </div>
              );
            })}

            {uncategorized.length > 0 && (
              <div className="mb-2">
                <div className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-muted-foreground">
                  <MessageSquare className="h-3 w-3" />
                  未分类
                </div>
                {uncategorized.map(renderConversation)}
              </div>
            )}

            {archivedConvs.length > 0 && (
              <div className="mb-2">
                <button
                  className="flex w-full items-center gap-1 px-2 py-1 text-xs font-medium text-muted-foreground"
                  onClick={() => setArchiveOpen((v) => !v)}
                >
                  {archiveOpen ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  <Archive className="h-3 w-3" />
                  归档 ({archivedConvs.length})
                </button>
                {archiveOpen && archivedConvs.map(renderConversation)}
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="space-y-1 border-t p-2">
          <Button variant="ghost" className="w-full justify-start gap-2 text-muted-foreground" asChild>
            <Link href="/settings" prefetch={false}>
              <Settings className="h-4 w-4" />
              设置
            </Link>
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-muted-foreground"
            onClick={logout}
          >
            <LogOut className="h-4 w-4" />
            退出登录
          </Button>
        </div>
      </aside>
    </>
  );
}
