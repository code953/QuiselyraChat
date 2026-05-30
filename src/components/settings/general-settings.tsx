"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuthStore } from "@/stores/auth";
import { authHeaders } from "@/lib/api-helpers";
import { useModelStore } from "@/stores/model";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Download, Moon, Sun } from "lucide-react";

export function GeneralSettings() {
  const { logout } = useAuthStore();
  const { models, fetchModels } = useModelStore();

  const [summaryModelId, setSummaryModelId] = useState<string>("__current__");
  const [loadingSummaryModel, setLoadingSummaryModel] = useState(true);
  const [savingSummaryModel, setSavingSummaryModel] = useState(false);
  const [summaryModelMsg, setSummaryModelMsg] = useState("");

  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof document !== "undefined") {
      return document.documentElement.classList.contains("dark") ? "dark" : "light";
    }
    return "dark";
  });

  const [exporting, setExporting] = useState(false);

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

  const handleThemeChange = useCallback((value: string) => {
    const newTheme = value as "dark" | "light";
    setTheme(newTheme);
    if (typeof document !== "undefined") {
      document.documentElement.classList.remove("dark", "light");
      document.documentElement.classList.add(newTheme);
    }
  }, []);

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
          const msgRes = await fetch(`/api/conversations/${conv.id}/messages`, {
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
      a.download = `nebulachat-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-base font-medium">通用设置</h2>

      <Card className="py-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">访问密码</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            访问密码只能通过服务端环境变量 ACCESS_PASSWORD 修改。修改后请重启服务，并使用新密码重新登录。
          </p>
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
            <Select value={theme} onValueChange={handleThemeChange}>
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
            variant="destructive"
            onClick={() => {
              if (confirm("确定退出登录？")) {
                logout();
                window.location.href = "/login";
              }
            }}
          >
            退出登录
          </Button>
        </CardContent>
      </Card>

      <Card className="py-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">关于</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>NebulaChat v0.1.0</p>
            <p>轻量级自托管 AI 聊天客户端</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
