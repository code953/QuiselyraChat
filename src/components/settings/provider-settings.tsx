"use client";

import { useEffect, useState, useCallback } from "react";
import { useModelConfigStore, type ModelConfigWithCount } from "@/stores/model-config";
import { useModelStore } from "@/stores/model";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { authHeaders } from "@/lib/api-helpers";
import { Plus, Trash2, RefreshCw, Settings2, Server, Loader2 } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";

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
type LocalModel = { id: string; modelId: string };

function isRemoteModel(value: unknown): value is RemoteModel {
  return typeof value === "object" && value !== null && typeof (value as RemoteModel).id === "string";
}

function isLocalModel(value: unknown): value is LocalModel {
  return typeof value === "object" && value !== null && typeof (value as LocalModel).id === "string" && typeof (value as LocalModel).modelId === "string";
}

type ModelSyncItem = {
  id: string;
  localId?: string;
  remote: boolean;
  local: boolean;
};

export function ProviderSettings() {
  const { configs, loading, fetchConfigs, createConfig, updateConfig, deleteConfig } =
    useModelConfigStore();
  const setModelCount = useModelConfigStore((s) => s.setModelCount);
  const { models, addModel, deleteModel, fetchModels, fetchRemoteModels } = useModelStore();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ConfigFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [fetchDialogOpen, setFetchDialogOpen] = useState(false);
  const [fetchingId, setFetchingId] = useState<string | null>(null);
  const [remoteModels, setRemoteModels] = useState<RemoteModel[]>([]);
  const [syncModels, setSyncModels] = useState<ModelSyncItem[]>([]);
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(new Set());
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [addingModels, setAddingModels] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  useEffect(() => {
    const counts = models.reduce<Record<string, number>>((acc, model) => {
      acc[model.modelConfigId] = (acc[model.modelConfigId] || 0) + 1;
      return acc;
    }, {});

    configs.forEach((config) => {
      const count = counts[config.id] || 0;
      if ((Number(config.modelCount) || 0) !== count) {
        setModelCount(config.id, count);
      }
    });
  }, [configs, models, setModelCount]);

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
      setSyncModels([]);
      setSelectedModelIds(new Set());
      setFetchError(null);
      try {
        const [remote, localRes] = await Promise.all([
          fetchRemoteModels(configId),
          fetch(`/api/models?configId=${encodeURIComponent(configId)}`, { headers: authHeaders() }),
        ]);
        if (!localRes.ok) {
          throw new Error("本地模型列表读取失败");
        }

        const remoteData = Array.isArray(remote) ? remote.filter(isRemoteModel) : [];
        const localData = await localRes.json().catch(() => []);
        const latestLocalModels = Array.isArray(localData) ? localData.filter(isLocalModel) : [];
        const remoteIds = new Set(remoteData.map((model) => model.id));
        const localByModelId = new Map(latestLocalModels.map((model) => [model.modelId, model]));
        const ids = Array.from(new Set([...remoteData.map((model) => model.id), ...latestLocalModels.map((model) => model.modelId)])).sort();

        setRemoteModels(remoteData);
        setSyncModels(ids.map((id) => {
          const localModel = localByModelId.get(id);
          return {
            id,
            localId: localModel?.id,
            remote: remoteIds.has(id),
            local: Boolean(localModel),
          };
        }));
        setSelectedModelIds(new Set(latestLocalModels.map((model) => model.modelId)));

        setModelCount(configId, latestLocalModels.length);
      } catch (error) {
        setFetchError(error instanceof Error ? error.message : "模型列表拉取失败");
      } finally {
        setFetchLoading(false);
      }
    },
    [fetchRemoteModels, setModelCount]
  );

  const toggleSyncModel = useCallback((modelId: string) => {
    setSelectedModelIds((prev) => {
      const next = new Set(prev);
      if (next.has(modelId)) {
        next.delete(modelId);
      } else {
        next.add(modelId);
      }
      return next;
    });
  }, []);

  const handleApplyModelSync = useCallback(async () => {
    if (!fetchingId) return;
    setAddingModels(true);
    setFetchError(null);
    try {
      for (const model of syncModels) {
        if (model.localId && !selectedModelIds.has(model.id)) {
          await deleteModel(model.localId);
        }
      }

      for (const model of syncModels) {
        if (selectedModelIds.has(model.id) && !model.local) {
          await addModel({
            modelConfigId: fetchingId,
            modelId: model.id,
            source: model.remote ? "fetched" : "manual",
          });
        }
      }

      for (const modelId of Array.from(selectedModelIds).filter((id) => !syncModels.some((model) => model.id === id))) {
        await addModel({
          modelConfigId: fetchingId,
          modelId,
          source: "manual",
        });
      }

      setFetchDialogOpen(false);
      await fetchModels();
      await fetchConfigs();
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : "模型同步失败");
    } finally {
      setAddingModels(false);
    }
  }, [fetchingId, syncModels, selectedModelIds, deleteModel, addModel, fetchModels, fetchConfigs]);

  const localSelectedCount = syncModels.filter((model) => model.local && selectedModelIds.has(model.id)).length;
  const addCount = syncModels.filter((model) => !model.local && selectedModelIds.has(model.id)).length;
  const deleteCount = syncModels.filter((model) => model.local && !selectedModelIds.has(model.id)).length;

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
                  onClick={() => setConfirmDeleteId(config.id)}
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
          <Button size="sm" variant="outline" onClick={openCreateDialog} className="mt-2">
            <Plus className="mr-1 h-4 w-4" />
            添加服务商
          </Button>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "编辑服务商" : "添加服务商"}</DialogTitle>
            <DialogDescription>
              配置模型服务商的 API 地址和密钥，密钥会加密保存在服务端。
            </DialogDescription>
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
            <DialogTitle>同步模型列表</DialogTitle>
            <DialogDescription>
              勾选要保留在本地模型库中的模型；取消勾选已有模型会在应用时删除。
            </DialogDescription>
          </DialogHeader>
          {fetchLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">正在获取模型列表...</span>
            </div>
          ) : syncModels.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">未获取到模型，且当前服务商没有已添加模型</p>
          ) : (
            <div className="max-h-[50vh] space-y-1 overflow-y-auto">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  远程 {remoteModels.length} 个，当前保留 {selectedModelIds.size} 个
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={fetchLoading || addingModels}
                  onClick={() => {
                    if (selectedModelIds.size === syncModels.length) {
                      setSelectedModelIds(new Set());
                    } else {
                      setSelectedModelIds(new Set(syncModels.map((model) => model.id)));
                    }
                  }}
                >
                  {selectedModelIds.size === syncModels.length ? "取消全选" : "全选"}
                </Button>
              </div>
              <div className="mb-2 rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground">
                已有保留 {localSelectedCount} 个，新增 {addCount} 个，删除 {deleteCount} 个
              </div>
              {syncModels.map((model) => (
                <label
                  key={model.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
                >
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={selectedModelIds.has(model.id)}
                    disabled={addingModels}
                    onChange={() => toggleSyncModel(model.id)}
                  />
                  <span className="flex-1 text-sm">{model.id}</span>
                  {model.local && <Badge variant="secondary" className="text-xs">已添加</Badge>}
                  {!model.remote && <Badge variant="outline" className="text-xs">本地</Badge>}
                  {model.remote && !model.local && <Badge variant="outline" className="text-xs">可添加</Badge>}
                </label>
              ))}
            </div>
          )}
          {fetchError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {fetchError}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFetchDialogOpen(false)} disabled={addingModels}>
              取消
            </Button>
            <Button
              onClick={handleApplyModelSync}
              disabled={fetchLoading || addingModels || syncModels.length === 0}
            >
              {addingModels && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              应用更改
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDeleteId !== null}
        onOpenChange={(open) => { if (!open) setConfirmDeleteId(null); }}
        title="删除服务商"
        description="确定要删除该服务商配置吗？关联的模型也会被一并删除，此操作不可恢复。"
        confirmText="删除"
        variant="destructive"
        onConfirm={() => {
          if (confirmDeleteId) handleDelete(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
      />
    </div>
  );
}
