"use client";

import { useEffect, useState, useCallback } from "react";
import { usePersonaStore, type Persona } from "@/stores/persona";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";

interface PersonaFormData {
  avatar: string;
  name: string;
  systemPrompt: string;
  greeting: string;
  recommendedModel: string;
}

const emptyForm: PersonaFormData = {
  avatar: "🤖",
  name: "",
  systemPrompt: "",
  greeting: "",
  recommendedModel: "",
};

export function PersonaSettings() {
  const { personas, loading, fetchPersonas, createPersona, updatePersona, deletePersona } =
    usePersonaStore();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PersonaFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    fetchPersonas();
  }, [fetchPersonas]);

  const openCreateDialog = useCallback(() => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }, []);

  const openEditDialog = useCallback((persona: Persona) => {
    setEditingId(persona.id);
    setForm({
      avatar: persona.avatar,
      name: persona.name,
      systemPrompt: persona.systemPrompt,
      greeting: persona.greeting || "",
      recommendedModel: persona.recommendedModel || "",
    });
    setDialogOpen(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.name || !form.systemPrompt) return;
    setSaving(true);
    try {
      if (editingId) {
        await updatePersona(editingId, {
          avatar: form.avatar,
          name: form.name,
          systemPrompt: form.systemPrompt,
          greeting: form.greeting || undefined,
          recommendedModel: form.recommendedModel || undefined,
        });
      } else {
        await createPersona({
          avatar: form.avatar,
          name: form.name,
          systemPrompt: form.systemPrompt,
          greeting: form.greeting || undefined,
          recommendedModel: form.recommendedModel || undefined,
        });
      }
      setDialogOpen(false);
    } finally {
      setSaving(false);
    }
  }, [form, editingId, createPersona, updatePersona]);

  const handleDelete = useCallback(
    (id: string) => {
      setConfirmDeleteId(id);
    },
    []
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium">人格管理</h2>
        <Button size="sm" onClick={openCreateDialog}>
          <Plus className="mr-1 h-4 w-4" />
          新建人格
        </Button>
      </div>

      {loading && personas.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {personas.map((persona) => (
          <Card key={persona.id} className="py-4">
            <CardContent className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{persona.avatar}</span>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium">{persona.name}</span>
                      {persona.builtin && (
                        <Badge variant="secondary" className="text-xs">
                          内置
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => openEditDialog(persona)}
                    aria-label="编辑人格"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {!persona.builtin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(persona.id)}
                      aria-label="删除人格"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              <p className="line-clamp-3 text-xs text-muted-foreground">
                {persona.systemPrompt}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {!loading && personas.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
          <p className="text-sm">暂无人格配置</p>
          <Button size="sm" variant="outline" onClick={openCreateDialog} className="mt-2">
            <Plus className="mr-1 h-4 w-4" />
            新建人格
          </Button>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "编辑人格" : "新建人格"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>头像 (Emoji)</Label>
              <Input
                value={form.avatar}
                onChange={(e) => setForm((prev) => ({ ...prev, avatar: e.target.value }))}
                placeholder="🤖"
                className="w-20 text-center text-lg"
              />
            </div>
            <div className="space-y-2">
              <Label>名称</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="人格名称"
              />
            </div>
            <div className="space-y-2">
              <Label>系统提示词</Label>
              <Textarea
                value={form.systemPrompt}
                onChange={(e) => setForm((prev) => ({ ...prev, systemPrompt: e.target.value }))}
                placeholder="你是一个..."
                rows={5}
              />
            </div>
            <div className="space-y-2">
              <Label>开场白</Label>
              <Input
                value={form.greeting}
                onChange={(e) => setForm((prev) => ({ ...prev, greeting: e.target.value }))}
                placeholder="可选的开场白消息"
              />
            </div>
            <div className="space-y-2">
              <Label>推荐模型</Label>
              <Input
                value={form.recommendedModel}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, recommendedModel: e.target.value }))
                }
                placeholder="模型 ID（可选）"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !form.name || !form.systemPrompt}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingId ? "保存" : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDeleteId !== null}
        onOpenChange={(open) => { if (!open) setConfirmDeleteId(null); }}
        title="删除人格"
        description="确定要删除该人格配置吗？此操作不可恢复。"
        confirmText="删除"
        variant="destructive"
        onConfirm={() => {
          if (confirmDeleteId) deletePersona(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
      />
    </div>
  );
}
