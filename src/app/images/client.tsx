"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AuthGuard } from "@/components/auth-guard";
import { useImageStore } from "@/stores/image";
import { useModelStore } from "@/stores/model";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ArrowLeft, Loader2, Sparkles, Download, Trash2 } from "lucide-react";

const IMAGE_KEYWORDS = ["dall", "image", "flux", "sd", "stable", "cogview", "jimeng", "seedream", "kolors", "wanx", "imagen"];

function ImagesLayout() {
  const { images, loading, generating, fetchImages, generateImage, deleteImage } = useImageStore();
  const { models, fetchModels } = useModelStore();

  const [prompt, setPrompt] = useState("");
  const [modelId, setModelId] = useState<string>("");
  const [size, setSize] = useState("1024x1024");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    fetchImages();
    fetchModels();
  }, [fetchImages, fetchModels]);

  // 优先展示疑似图像模型，若无匹配则展示全部启用模型
  const imageModels = useMemo(() => {
    const enabled = models.filter((m) => m.enabled);
    const filtered = enabled.filter((m) =>
      IMAGE_KEYWORDS.some((k) => (m.modelId || "").toLowerCase().includes(k))
    );
    return filtered.length > 0 ? filtered : enabled;
  }, [models]);

  // 未显式选择时默认第一个（渲染期派生，避免 effect 内 setState）
  const effectiveModelId = modelId || imageModels[0]?.id || "";

  const handleGenerate = async () => {
    if (!prompt.trim() || !effectiveModelId) return;
    await generateImage(prompt.trim(), effectiveModelId, size);
  };

  const handleDownload = (url: string, id: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = `nekorachat-${id}.png`;
    a.click();
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <Button variant="ghost" size="icon" asChild aria-label="返回">
          <Link href="/">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="text-lg font-semibold">图片生成</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-4xl space-y-4">
          <Card className="py-4">
            <CardContent className="space-y-3">
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="描述你想生成的图片…"
                className="min-h-24 resize-none"
              />
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-48 flex-1 space-y-1.5">
                  <label className="text-xs text-muted-foreground">模型</label>
                  <Select value={effectiveModelId} onValueChange={setModelId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="选择模型" />
                    </SelectTrigger>
                    <SelectContent>
                      {imageModels.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.providerName} / {m.displayName || m.modelId}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-36 space-y-1.5">
                  <label className="text-xs text-muted-foreground">尺寸</label>
                  <Select value={size} onValueChange={setSize}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1024x1024">1024×1024</SelectItem>
                      <SelectItem value="1024x1792">1024×1792</SelectItem>
                      <SelectItem value="1792x1024">1792×1024</SelectItem>
                      <SelectItem value="512x512">512×512</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleGenerate} disabled={generating || !prompt.trim() || !effectiveModelId}>
                  {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  生成
                </Button>
              </div>
              {imageModels.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  暂无可用模型，请先在「设置 → 服务商 / 模型」中添加支持图片生成的模型。
                </p>
              )}
            </CardContent>
          </Card>

          <div>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">生成画廊</h2>
            {loading ? (
              <p className="text-sm text-muted-foreground">加载中…</p>
            ) : images.length === 0 ? (
              <p className="text-sm text-muted-foreground">还没有生成的图片。</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {images.filter((img) => img.status === "success").map((img) => (
                  <Card key={img.id} className="group overflow-hidden py-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt={img.prompt} className="aspect-square w-full object-cover" loading="lazy" />
                    <div className="space-y-1.5 p-2">
                      <p className="line-clamp-2 text-xs text-muted-foreground" title={img.prompt}>
                        {img.prompt}
                      </p>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDownload(img.url, img.id)} aria-label="下载">
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setConfirmDeleteId(img.id)} aria-label="删除">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDeleteId !== null}
        onOpenChange={(open) => { if (!open) setConfirmDeleteId(null); }}
        title="删除图片"
        description="确定要删除这张图片吗？此操作不可恢复。"
        confirmText="删除"
        variant="destructive"
        onConfirm={() => { if (confirmDeleteId) deleteImage(confirmDeleteId); setConfirmDeleteId(null); }}
      />
    </div>
  );
}

export default function ImagesClient() {
  return (
    <AuthGuard>
      <ImagesLayout />
    </AuthGuard>
  );
}
