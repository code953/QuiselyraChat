"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { authHeaders } from "@/lib/api-helpers";
import { useModelStore } from "@/stores/model";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Download, Upload, Moon, Sun } from "lucide-react";

export function GeneralSettings() {
  const { models, fetchModels } = useModelStore();

  const [summaryModelId, setSummaryModelId] = useState<string>("__current__");
  const [loadingSummaryModel, setLoadingSummaryModel] = useState(true);
  const [savingSummaryModel, setSavingSummaryModel] = useState(false);
  const [summaryModelMsg, setSummaryModelMsg] = useState("");

  const { theme, setTheme } = useTheme();

  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 修改密码
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  useEffect(() => {
    let ignore = false;
    fetch("/api/settings/default-summary-model", { headers: authHeaders() })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (ignore) return;
        setSummaryModelId(data?.modelId || "__current__");
      })
      .catch(() => {})
      .finally(() => {
        if (!ignore) setLoadingSummaryModel(false);
      });
    return () => {
      ignore = true;
    };
  }, []);

  const handleSaveSummaryModel = useCallback(async () => {
    setSavingSummaryModel(true);
    setSummaryModelMsg("");
    try {
      const res = await fetch("/api/settings/default-summary-model", {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ modelId: summaryModelId === "__current__" ? null : summaryModelId }),
      });
      setSummaryModelMsg(res.ok ? "已保存" : "保存失败");
    } catch {
      setSummaryModelMsg("保存失败");
    } finally {
      setSavingSummaryModel(false);
    }
  }, [summaryModelId]);

  const handleChangePassword = useCallback(async () => {
    if (!currentPassword) {
      toast.error("请输入当前密码");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("新密码至少 6 个字符");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("两次输入的新密码不一致");
      return;
    }
    setSavingPassword(true);
    try {
      const res = await fetch("/api/settings/password", {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (res.ok) {
        toast.success("密码已修改，下次登录请使用新密码");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data?.message || "修改密码失败");
      }
    } catch {
      toast.error("修改密码失败");
    } finally {
      setSavingPassword(false);
    }
  }, [currentPassword, newPassword, confirmPassword]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const [convRes, modelsRes, personasRes] = await Promise.all([
        fetch("/api/conversations", { headers: authHeaders() }),
        fetch("/api/models", { headers: authHeaders() }),
        fetch("/api/personas", { headers: authHeaders() }),
      ]);

      const conversations = convRes.ok ? await convRes.json() : [];
      const models = modelsRes.ok ? await modelsRes.json() : [];
      const personas = personasRes.ok ? await personasRes.json() : [];

      const messagesMap: Record<string, unknown[]> = {};
      for (const conv of conversations) {
        try {
          const msgRes = await fetch(`/api/conversation-messages?conversationId=${encodeURIComponent(conv.id)}`, {
            headers: authHeaders(),
          });
          if (msgRes.ok) {
            messagesMap[conv.id] = await msgRes.json();
          }
        } catch {}
      }

      const exportData = {
        exportedAt: new Date().toISOString(),
        conversations,
        messages: messagesMap,
        models,
        personas,
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nekorachat-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }, []);

  const handleImportFile = useCallback(
    async (file: File) => {
      setImporting(true);
      try {
        let payload: unknown;
        try {
          payload = JSON.parse(await file.text());
        } catch {
          toast.error("导入失败：文件不是合法的 JSON");
          return;
        }

        const res = await fetch("/api/data/import", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          toast.error(data?.message || "导入失败");
          return;
        }

        const parts = [`新增 ${data.added} 项`];
        if (data.renamed > 0) parts.push(`冲突重命名 ${data.renamed} 项`);
        if (data.skipped > 0) parts.push(`跳过 ${data.skipped} 项`);
        toast.success(`导入完成：${parts.join("，")}（含 ${data.messages} 条消息）`);

        // 刷新受影响的本地数据
        fetchModels();
      } catch {
        toast.error("导入失败");
      } finally {
        setImporting(false);
      }
    },
    [fetchModels]
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // 允许重复选择同一文件
      e.target.value = "";
      if (file) handleImportFile(file);
    },
    [handleImportFile]
  );

  return (
    <div className="space-y-4">
      <h2 className="text-base font-medium">通用设置</h2>

      <Card className="py-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">访问密码</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            修改访问密码。修改后请使用新密码重新登录。
          </p>
          <div className="grid gap-3 sm:max-w-sm">
            <div className="space-y-1.5">
              <Label htmlFor="current-password">当前密码</Label>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="输入当前密码"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-password">新密码</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="至少 6 个字符"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">确认新密码</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="再次输入新密码"
              />
            </div>
          </div>
          <Button size="sm" onClick={handleChangePassword} disabled={savingPassword}>
            {savingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            修改密码
          </Button>
        </CardContent>
      </Card>

      <Card className="py-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">对话总结模型</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>默认标题/总结模型</Label>
            <Select value={summaryModelId} onValueChange={setSummaryModelId} disabled={loadingSummaryModel}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择模型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__current__">留空，使用当前对话模型</SelectItem>
                {models.filter((m) => m.enabled).map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.providerName} / {model.displayName || model.modelId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {summaryModelMsg && <p className="text-sm text-muted-foreground">{summaryModelMsg}</p>}
          <Button size="sm" onClick={handleSaveSummaryModel} disabled={savingSummaryModel || loadingSummaryModel}>
            {savingSummaryModel && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            保存总结模型
          </Button>
        </CardContent>
      </Card>

      <Card className="py-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">外观</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Label>主题</Label>
            <Select value={theme} onValueChange={setTheme}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dark">
                  <div className="flex items-center gap-1.5">
                    <Moon className="h-3.5 w-3.5" />
                    深色
                  </div>
                </SelectItem>
                <SelectItem value="light">
                  <div className="flex items-center gap-1.5">
                    <Sun className="h-3.5 w-3.5" />
                    浅色
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="py-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">数据管理</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={handleExport} disabled={exporting}>
              {exporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              导出所有数据
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
            >
              {importing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              导入数据
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={onFileChange}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            导入此前导出的 JSON 文件。按 id 比对：不冲突则直接新增；冲突则保留原有数据，导入的记录会加「{"[导入] "}」前缀作为新记录一并保留，不会覆盖已有数据。
            模型需其所属服务商仍存在才能导入，否则会被跳过。
          </p>
        </CardContent>
      </Card>

      <Card className="py-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">关于</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>NekoraChat v0.1.0</p>
            <p>轻量级自托管 AI 聊天客户端</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
