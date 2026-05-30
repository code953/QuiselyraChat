"use client";

import { useEffect, useState, useCallback } from "react";
import { useModelConfigStore, type ModelConfigWithCount } from "@/stores/model-config";
import { useModelStore } from "@/stores/model";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, RefreshCw, Settings2, Server, Loader2 } from "lucide-react";

const PROVIDER_PRESETS: Record<string, { label: string; baseUrl: string }> = {
  openai: { label: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  anthropic: { label: "Anthropic", baseUrl: "https://api.anthropic.com/v1" },
  google: { label: "Google", baseUrl: "https://generativelanguage.googleapis.com/v1beta" },
  xai: { label: "xAI", baseUrl: "https://api.x.ai/v1" },
  deepseek: { label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1" },
  moonshot: { label: "Moonshot", baseUrl: "https://api.moonshot.cn/v1" },
  zhipu: { label: "智谱 AI", baseUrl: "https://open.bigmodel.cn/api/paas/v4" },
  openrouter: { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
  ollama: { label: "Ollama", baseUrl: "http://localhost:11434/v1" },
  custom: { label: "自定义", baseUrl: "" },
};

interface ConfigFormData {
  provider: string;
  name: string;
  baseUrl: string;
  apiKey: string;
}

const emptyForm: ConfigFormData = { provider: "", name: "", baseUrl: "", apiKey: "" };

type RemoteModel = { id: string; object?: string };

export function ProviderSettings() {
  const { configs, loading, fetchConfigs, createConfig, updateConfig, deleteConfig } =
    useModelConfigStore();
  const incrementModelCount = useModelConfigStore((s) => s.incrementModelCount);
  const { addModel, fetchRemoteModels } = useModelStore();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ConfigFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [fetchDialogOpen, setFetchDialogOpen] = useState(false);
  const [fetchingId, setFetchingId] = useState<string | null>(null);
  const [remoteModels, setRemoteModels] = useState<RemoteModel[]>([]);
  const [selectedRemoteModels, setSelectedRemoteModels] = useState<Set<string>>(new Set());
  const [fetchLoading, setFetchLoading] = useState(false);
  const [addingModels, setAddingModels] = useState(false);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  const openCreateDialog = useCallback(() => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }, []);

  const openEditDialog = useCallback((config: ModelConfigWithCount) => {
    setEditingId(config.id);
    setForm({
      provider: config.provider,
      name: config.name,
      baseUrl: config.baseUrl,
      apiKey: "",
    });
    setDialogOpen(true);
  }, []);

  const handleProviderChange = useCallback((provider: string) => {
    const preset = PROVIDER_PRESETS[provider];
    setForm((prev) => ({
      ...prev,
      provider,
      name: prev.name || preset?.label || "",
      baseUrl: preset?.baseUrl || prev.baseUrl,
    }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.provider || !form.name || !form.baseUrl) return;
    setSaving(true);
    try {
      if (editingId) {
        const updates: Record<string, string> = {
          provider: form.provider,
          name: form.name,
          baseUrl: form.baseUrl,
        };
        if (form.apiKey) updates.apiKey = form.apiKey;
        await updateConfig(editingId, updates);
      } else {
        if (!form.apiKey) return;
        await createConfig({
          provider: form.provider,
          name: form.name,
          baseUrl: form.baseUrl,
          apiKey: form.apiKey,
        });
      }
      setDialogOpen(false);
    } finally {
      setSaving(false);
    }
  }, [form, editingId, createConfig, updateConfig]);

  const handleDelete = useCallback(
    async (id: string) => {
      setDeletingId(id);
      await deleteConfig(id);
      setDeletingId(null);
    },
    [deleteConfig]
  );

  const handleFetchModels = useCallback(
    async (configId: string) => {
      setFetchingId(configId);
      setFetchLoading(true);
      setFetchDialogOpen(true);
      setRemoteModels([]);
      setSelectedRemoteModels(new Set());
      try {
        const models = (await fetchRemoteModels(configId)) as RemoteModel[];
        if (models) {
          setRemoteModels(models);
          setSelectedRemoteModels(new Set(models.map((m) => m.id)));
        }
      } finally {
        setFetchLoading(false);
      }
    },
    [fetchRemoteModels]
  );

  const toggleRemoteModel = useCallback((modelId: string) => {
    setSelectedRemoteModels((prev) => {
      const next = new Set(prev);
      if (next.has(modelId)) {
        next.delete(modelId);
      } else {
        next.add(modelId);
      }
      return next;
    });
  }, []);

  const handleAddSelectedModels = useCallback(async () => {
    if (!fetchingId || selectedRemoteModels.size === 0) return;
    setAddingModels(true);
    try {
      let addedCount = 0;
      for (const modelId of selectedRemoteModels) {
        await addModel({
          modelConfigId: fetchingId,
          modelId,
          source: "fetched",
        });
        addedCount += 1;
      }
      incrementModelCount(fetchingId, addedCount);
      setFetchDialogOpen(false);
      await fetchConfigs();
    } finally {
      setAddingModels(false);
    }
  }, [fetchingId, selectedRemoteModels, addModel, incrementModelCount, fetchConfigs]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium">服务商配置</h2>
        <Button size="sm" onClick={openCreateDialog}>
          <Plus className="mr-1 h-4 w-4" />
          添加服务商
        </Button>
      </div>

      {loading && configs.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      <div className="grid gap-3">
        {configs.map((config) => (
          <Card key={config.id} className="py-4">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Server className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm">{config.name}</CardTitle>
                  <Badge variant="secondary" className="text-xs">
                    {PROVIDER_PRESETS[config.provider]?.label || config.provider}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {config.modelCount ?? 0} 个模型
                  </span>
                </div>
                <Switch
                  checked={config.enabled}
                  onCheckedChange={(checked) => updateConfig(config.id, { enabled: checked })}
                />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => openEditDialog(config)}>
                  <Settings2 className="mr-1 h-3.5 w-3.5" />
                  编辑
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleFetchModels(config.id)}
                >
                  <RefreshCw className="mr-1 h-3.5 w-3.5" />
                  拉取模型
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={deletingId === config.id}
                  onClick={() => {
                    if (confirm("确定删除该服务商配置？关联的模型也会被删除。")) {
                      handleDelete(config.id);
                    }
                  }}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  删除
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {!loading && configs.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
          <Server className="h-8 w-8" />
          <p className="text-sm">暂无服务商配置</p>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "编辑服务商" : "添加服务商"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>服务商类型</Label>
              <Select value={form.provider} onValueChange={handleProviderChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择服务商" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PROVIDER_PRESETS).map(([key, preset]) => (
                    <SelectItem key={key} value={key}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>名称</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="服务商名称"
              />
            </div>
            <div className="space-y-2">
              <Label>API 地址</Label>
              <Input
                value={form.baseUrl}
                onChange={(e) => setForm((prev) => ({ ...prev, baseUrl: e.target.value }))}
                placeholder="https://api.example.com/v1"
              />
            </div>
            <div className="space-y-2">
              <Label>API 密钥</Label>
              <Input
                type="password"
                value={form.apiKey}
                onChange={(e) => setForm((prev) => ({ ...prev, apiKey: e.target.value }))}
                placeholder={editingId ? "留空则不修改" : "输入 API Key"}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !form.provider || !form.name || !form.baseUrl || (!editingId && !form.apiKey)}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingId ? "保存" : "添加"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={fetchDialogOpen} onOpenChange={setFetchDialogOpen}>
        <DialogContent className="max-h-[80vh] overflow-hidden sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>拉取远程模型</DialogTitle>
          </DialogHeader>
          {fetchLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">正在获取模型列表...</span>
            </div>
          ) : remoteModels.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">未获取到模型</p>
          ) : (
            <div className="max-h-[50vh] space-y-1 overflow-y-auto">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  共 {remoteModels.length} 个模型，已选 {selectedRemoteModels.size} 个
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (selectedRemoteModels.size === remoteModels.length) {
                      setSelectedRemoteModels(new Set());
                    } else {
                      setSelectedRemoteModels(new Set(remoteModels.map((m) => m.id)));
                    }
                  }}
                >
                  {selectedRemoteModels.size === remoteModels.length ? "取消全选" : "全选"}
                </Button>
              </div>
              {remoteModels.map((model) => (
                <label
                  key={model.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
                >
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={selectedRemoteModels.has(model.id)}
                    onChange={() => toggleRemoteModel(model.id)}
                  />
                  <span className="text-sm">{model.id}</span>
                </label>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFetchDialogOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleAddSelectedModels}
              disabled={addingModels || selectedRemoteModels.size === 0}
            >
              {addingModels && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              添加 {selectedRemoteModels.size} 个模型
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
