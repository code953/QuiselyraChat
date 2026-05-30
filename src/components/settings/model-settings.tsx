"use client";

import { useEffect, useState, useCallback } from "react";
import { useModelStore, type ModelFullTestResult, type ModelWithProvider } from "@/stores/model";
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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Star, FlaskConical } from "lucide-react";

interface ModelFormData {
  displayName: string;
  contextWindow: string;
  pricingInput: string;
  pricingOutput: string;
  chat: boolean;
  vision: boolean;
  tools: boolean;
  json: boolean;
  reasoning: boolean;
  paramsOverride: string;
}

function toFormData(model: ModelWithProvider): ModelFormData {
  return {
    displayName: model.displayName || "",
    contextWindow: model.contextWindow?.toString() || "",
    pricingInput: model.pricing?.inputPer1k?.toString() || "",
    pricingOutput: model.pricing?.outputPer1k?.toString() || "",
    chat: model.capabilities.chat,
    vision: model.capabilities.vision,
    tools: model.capabilities.tools,
    json: model.capabilities.json,
    reasoning: model.capabilities.reasoning,
    paramsOverride: model.paramsOverride ? JSON.stringify(model.paramsOverride, null, 2) : "",
  };
}

function ResultBadge({ result }: { result?: { success: boolean } }) {
  if (!result) return <Badge variant="outline">未测试</Badge>;
  return result.success ? <Badge variant="secondary">通过</Badge> : <Badge variant="destructive">失败</Badge>;
}

function formatLatency(latencyMs?: number) {
  return typeof latencyMs === "number" ? `${latencyMs}ms` : "-";
}

export function ModelSettings() {
  const { models, loading, fetchModels, updateModel, deleteModel, testModel } = useModelStore();

  const [editModel, setEditModel] = useState<ModelWithProvider | null>(null);
  const [form, setForm] = useState<ModelFormData | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingIds, setTestingIds] = useState<Set<string>>(new Set());
  const [bulkTesting, setBulkTesting] = useState(false);
  const [testModelTarget, setTestModelTarget] = useState<ModelWithProvider | null>(null);
  const [testResult, setTestResult] = useState<ModelFullTestResult | null>(null);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const grouped = models.reduce<Record<string, ModelWithProvider[]>>((acc, model) => {
    const key = model.providerName || model.modelConfigId;
    if (!acc[key]) acc[key] = [];
    acc[key].push(model);
    return acc;
  }, {});

  const openEdit = useCallback((model: ModelWithProvider) => {
    setEditModel(model);
    setForm(toFormData(model));
  }, []);

  const handleSave = useCallback(async () => {
    if (!editModel || !form) return;
    setSaving(true);
    try {
      let paramsOverride: Record<string, unknown> | undefined;
      if (form.paramsOverride.trim()) {
        try {
          paramsOverride = JSON.parse(form.paramsOverride);
        } catch {
          return;
        }
      }

      await updateModel(editModel.id, {
        displayName: form.displayName || undefined,
        contextWindow: form.contextWindow ? parseInt(form.contextWindow) : undefined,
        pricing:
          form.pricingInput || form.pricingOutput
            ? {
                inputPer1k: form.pricingInput ? parseFloat(form.pricingInput) : undefined,
                outputPer1k: form.pricingOutput ? parseFloat(form.pricingOutput) : undefined,
              }
            : undefined,
        capabilities: {
          chat: form.chat,
          vision: form.vision,
          tools: form.tools,
          json: form.json,
          reasoning: form.reasoning,
        },
        paramsOverride: paramsOverride as Record<string, unknown>,
      });
      setEditModel(null);
    } finally {
      setSaving(false);
    }
  }, [editModel, form, updateModel]);

  const handleTest = useCallback(
    async (model: ModelWithProvider) => {
      setTestModelTarget(model);
      setTestResult(null);
      setTestingIds((prev) => new Set(prev).add(model.id));
      try {
        const result = await testModel(model.id);
        setTestResult(result);
      } finally {
        setTestingIds((prev) => {
          const next = new Set(prev);
          next.delete(model.id);
          return next;
        });
      }
    },
    [testModel]
  );

  const handleBulkTest = useCallback(async () => {
    setBulkTesting(true);
    const enabledModels = models.filter((m) => m.enabled);
    for (const model of enabledModels) {
      setTestingIds((prev) => new Set(prev).add(model.id));
      try {
        await testModel(model.id);
      } finally {
        setTestingIds((prev) => {
          const next = new Set(prev);
          next.delete(model.id);
          return next;
        });
      }
    }
    setBulkTesting(false);
  }, [models, testModel]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium">模型管理</h2>
        <Button size="sm" onClick={handleBulkTest} disabled={bulkTesting}>
          {bulkTesting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          <FlaskConical className="mr-1 h-4 w-4" />
          批量测试
        </Button>
      </div>

      {loading && models.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {Object.entries(grouped).map(([providerName, providerModels]) => (
        <div key={providerName} className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">{providerName}</h3>
          <div className="grid gap-2">
            {providerModels.map((model) => (
              <Card key={model.id} className="py-3">
                <CardHeader className="pb-1">
                  <div className="flex items-center justify-between">
                    <div
                      className="flex flex-1 cursor-pointer items-center gap-2"
                      onClick={() => openEdit(model)}
                    >
                      <CardTitle className="text-sm">
                        {model.displayName || model.modelId}
                      </CardTitle>
                      {model.provider && (
                        <Badge variant="outline" className="text-xs">
                          {model.provider}
                        </Badge>
                      )}
                      {model.capabilities.chat && (
                        <Badge variant="secondary" className="text-xs">
                          对话
                        </Badge>
                      )}
                      {model.capabilities.vision && (
                        <Badge variant="secondary" className="text-xs">
                          视觉
                        </Badge>
                      )}
                      {model.capabilities.tools && (
                        <Badge variant="secondary" className="text-xs">
                          工具
                        </Badge>
                      )}
                      {model.lastTestResult && (
                        <span className="text-xs">
                          {(model.lastTestResult as Record<string, unknown>).success ? "✅" : "❌"}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className="text-muted-foreground hover:text-yellow-500"
                        onClick={() => updateModel(model.id, { pinned: !model.pinned })}
                      >
                        <Star
                          className={`h-4 w-4 ${model.pinned ? "fill-yellow-500 text-yellow-500" : ""}`}
                        />
                      </button>
                      <Switch
                        checked={model.enabled}
                        onCheckedChange={(checked) =>
                          updateModel(model.id, { enabled: checked })
                        }
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" disabled={testingIds.has(model.id)} onClick={() => handleTest(model)}>
                      {testingIds.has(model.id) ? (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FlaskConical className="mr-1 h-3.5 w-3.5" />
                      )}
                      测试
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm("确定删除该模型？")) {
                          deleteModel(model.id);
                        }
                      }}
                    >
                      删除
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}

      {!loading && models.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          暂无模型，请先在服务商页添加服务商并拉取模型
        </p>
      )}

      <Dialog open={!!editModel} onOpenChange={(open) => !open && setEditModel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑模型 - {editModel?.modelId}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>显示名称</Label>
                <Input
                  value={form.displayName}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                  placeholder="自定义显示名称"
                />
              </div>
              <div className="space-y-2">
                <Label>上下文窗口</Label>
                <Input
                  type="number"
                  value={form.contextWindow}
                  onChange={(e) => setForm({ ...form, contextWindow: e.target.value })}
                  placeholder="如 128000"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>输入价格 ($/1k tokens)</Label>
                  <Input
                    type="number"
                    step="0.0001"
                    value={form.pricingInput}
                    onChange={(e) => setForm({ ...form, pricingInput: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>输出价格 ($/1k tokens)</Label>
                  <Input
                    type="number"
                    step="0.0001"
                    value={form.pricingOutput}
                    onChange={(e) => setForm({ ...form, pricingOutput: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>能力</Label>
                <div className="flex flex-wrap gap-3">
                  {(["chat", "vision", "tools", "json", "reasoning"] as const).map((cap) => (
                    <label key={cap} className="flex items-center gap-1.5 text-sm">
                      <Switch
                        checked={form[cap]}
                        onCheckedChange={(checked) => setForm({ ...form, [cap]: checked })}
                      />
                      {{ chat: "对话", vision: "视觉", tools: "工具", json: "JSON", reasoning: "推理" }[cap]}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>参数覆盖 (JSON)</Label>
                <Textarea
                  value={form.paramsOverride}
                  onChange={(e) => setForm({ ...form, paramsOverride: e.target.value })}
                  placeholder='{"temperature": 0.7}'
                  className="font-mono text-xs"
                  rows={4}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditModel(null)}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!testModelTarget} onOpenChange={(open) => !open && setTestModelTarget(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>模型能力测试 - {testModelTarget?.displayName || testModelTarget?.modelId}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {testModelTarget && testingIds.has(testModelTarget.id) && (
              <div className="flex items-center gap-2 rounded-md border p-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在依次测试文本、图片和工具调用能力...
              </div>
            )}
            {(["chat", "vision", "tools"] as const).map((type) => {
              const result = testResult?.[type];
              const labels = { chat: "文本聊天", vision: "图片识别", tools: "工具调用" };
              return (
                <Card key={type} className="py-3">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">{labels[type]}</CardTitle>
                      <ResultBadge result={result} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-1 pt-0 text-sm text-muted-foreground">
                    <p>耗时：{formatLatency(result?.latencyMs)}</p>
                    {result?.tokens && <p>Token：{result.tokens.total ?? "-"}</p>}
                    {type === "tools" && result && <p>工具调用：{result.hasToolCalls ? "已触发" : "未触发"}</p>}
                    {result?.response && <p className="break-words">响应：{result.response}</p>}
                    {result?.error && <p className="break-words text-destructive">错误：{result.error}</p>}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestModelTarget(null)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
