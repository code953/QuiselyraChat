"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useShareStore } from "@/stores/share";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Copy, Loader2, Link2, Trash2 } from "lucide-react";

interface ShareDialogProps {
  conversationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareDialog({ conversationId, open, onOpenChange }: ShareDialogProps) {
  const { tokens, loading, fetchTokens, createToken, toggleToken, revokeToken } = useShareStore();
  const [expiresInDays, setExpiresInDays] = useState<string>("0");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open && conversationId) fetchTokens(conversationId);
  }, [open, conversationId, fetchTokens]);

  const shareUrl = (token: string) =>
    typeof window !== "undefined" ? `${window.location.origin}/share/${token}` : `/share/${token}`;

  const handleCreate = async () => {
    setCreating(true);
    try {
      const days = Number(expiresInDays);
      const created = await createToken(conversationId, days > 0 ? days : undefined);
      if (created) {
        await navigator.clipboard.writeText(shareUrl(created.token)).catch(() => {});
        toast.success("分享链接已创建并复制到剪贴板");
      }
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async (token: string) => {
    await navigator.clipboard.writeText(shareUrl(token));
    toast.success("链接已复制");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>分享对话</DialogTitle>
          <DialogDescription>
            生成只读快照链接，任何人无需登录即可查看。可随时撤销。
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <label className="text-xs text-muted-foreground">有效期</label>
            <Select value={expiresInDays} onValueChange={setExpiresInDays}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">永不过期</SelectItem>
                <SelectItem value="1">1 天</SelectItem>
                <SelectItem value="7">7 天</SelectItem>
                <SelectItem value="30">30 天</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
            创建链接
          </Button>
        </div>

        <div className="max-h-64 space-y-2 overflow-y-auto">
          {loading && <p className="text-sm text-muted-foreground">加载中…</p>}
          {!loading && tokens.length === 0 && (
            <p className="text-sm text-muted-foreground">暂无分享链接</p>
          )}
          {tokens.map((t) => {
            return (
              <div key={t.id} className="rounded-lg border p-2.5 text-sm">
                <div className="flex items-center gap-2">
                  <Input readOnly value={shareUrl(t.token)} className="h-8 flex-1 text-xs" />
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleCopy(t.token)} aria-label="复制">
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive"
                    onClick={() => revokeToken(t.token)}
                    aria-label="撤销"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                  <span>浏览 {t.viewCount} 次</span>
                  <span>
                    {!t.enabled
                      ? "已禁用"
                      : t.expiresAt
                        ? `到期 ${new Date(t.expiresAt).toLocaleDateString("zh-CN")}`
                        : "永不过期"}
                  </span>
                  <button
                    className="ml-auto underline hover:text-foreground"
                    onClick={() => toggleToken(t.token, !t.enabled)}
                  >
                    {t.enabled ? "禁用" : "启用"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
