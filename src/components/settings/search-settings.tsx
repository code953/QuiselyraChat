"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useSearchConfigStore } from "@/stores/search-config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Plus, Trash2, CheckCircle2 } from "lucide-react";

const PRESETS: Record<string, { name: string; needsKey: boolean; needsBaseUrl: boolean; hint: string }> = {
  tavily: { name: "Tavily", needsKey: true, needsBaseUrl: false, hint: "通用搜索，通过 Function Calling 适配所有模型" },
  searxng: { name: "SearXNG（自建）", needsKey: false, needsBaseUrl: true, hint: "自建实例，需在 settings.yml 开启 format: [html, json]" },
  zhipu: { name: "智谱（原生）", needsKey: false, needsBaseUrl: false, hint: "智谱模型原生联网搜索，仅对智谱模型生效" },
};

export function SearchSettings() {
  const { configs, activeConfigId, fetchConfigs, fetchActive, createConfig, deleteConfig, setActive } =
    useSearchConfigStore();

  const [adding, setAdding] = useState(false);
  const [provider, setProvider] = useState("tavily");
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    fetchConfigs();
    fetchActive();
  }, [fetchConfigs, fetchActive]);

  const preset = PRESETS[provider];

  const resetForm = () => {
    setProvider("tavily");
    setName("");
    setBaseUrl("");
    setApiKey("");
    setAdding(false);
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("请填写名称");
      return;
    }
    if (preset.needsKey && !apiKey.trim()) {
      toast.error(`${preset.name} 需要 API Key`);
      return;
    }
    if (preset.needsBaseUrl && !baseUrl.trim()) {
      toast.error(`${preset.name} 需要 Base URL`);
      return;
    }
    setSaving(true);
    const ok = await createConfig({
      provider,
      name: name.trim(),
      baseUrl: baseUrl.trim() || undefined,
      apiKey: apiKey.trim() || undefined,
    });
    setSaving(false);
    if (ok) resetForm();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-medium">联网搜索</h2>
          <p className="text-sm text-muted-foreground">配置搜索提供商，并在对话中开启联网搜索。</p>
        </div>
        {!adding && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="mr-1 h-4 w-4" />
            添加
          </Button>
        )}
      </div>

      {adding && (
        <Card className="py-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">添加搜索提供商</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>提供商</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRESETS).map(([key, p]) => (
                    <SelectItem key={key} value={key}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{preset.hint}</p>
            </div>
            <div className="space-y-1.5">
              <Label>名称</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="如 Tavily 主账号" />
            </div>
            {preset.needsBaseUrl && (
              <div className="space-y-1.5">
                <Label>Base URL</Label>
                <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://searxng.example.com" />
              </div>
            )}
            {preset.needsKey && (
              <div className="space-y-1.5">
                <Label>API Key</Label>
                <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="tvly-..." />
              </div>
            )}
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreate} disabled={saving}>保存</Button>
              <Button size="sm" variant="outline" onClick={resetForm} disabled={saving}>取消</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {configs.length === 0 && !adding && (
        <p className="text-sm text-muted-foreground">尚未配置搜索提供商。</p>
      )}

      <div className="space-y-2">
        {configs.map((c) => {
          const isActive = activeConfigId === c.id;
          return (
            <Card key={c.id} className="py-3">
              <CardContent className="flex items-center gap-3 px-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {c.name}
                    {isActive && <CheckCircle2 className="h-4 w-4 text-primary" />}
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {PRESETS[c.provider]?.name || c.provider}
                    </span>
                  </div>
                  {c.baseUrl && <p className="mt-0.5 truncate text-xs text-muted-foreground">{c.baseUrl}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">当前使用</span>
                  <Switch
                    checked={isActive}
                    onCheckedChange={(checked) => setActive(checked ? c.id : null)}
                  />
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setConfirmDeleteId(c.id)} aria-label="删除">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <ConfirmDialog
        open={confirmDeleteId !== null}
        onOpenChange={(open) => { if (!open) setConfirmDeleteId(null); }}
        title="删除搜索配置"
        description="确定要删除这个搜索提供商配置吗？"
        confirmText="删除"
        variant="destructive"
        onConfirm={() => { if (confirmDeleteId) deleteConfig(confirmDeleteId); setConfirmDeleteId(null); }}
      />
    </div>
  );
}
