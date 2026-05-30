"use client";

import { useEffect, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useModelStore } from "@/stores/model";
import { useChatStore } from "@/stores/chat";

const NO_MODEL_VALUE = "__no_model__";

export function ModelSelector() {
  const { models, fetchModels } = useModelStore();
  const { selectedModelId, setSelectedModelId } = useChatStore();

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const enabledModels = useMemo(
    () => models.filter((m) => m.enabled),
    [models]
  );

  useEffect(() => {
    if (!selectedModelId && enabledModels.length > 0) {
      const defaultModel = enabledModels.find((m) => m.pinned) || enabledModels[0];
      setSelectedModelId(defaultModel.id);
    }
  }, [enabledModels, selectedModelId, setSelectedModelId]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof enabledModels>();
    for (const m of enabledModels) {
      const key = m.providerName || m.provider;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return map;
  }, [enabledModels]);

  const capLabels: Record<string, string> = {
    vision: "视觉",
    tools: "工具",
    json: "JSON",
    reasoning: "推理",
  };

  return (
    <Select
      value={selectedModelId ?? NO_MODEL_VALUE}
      onValueChange={(v) => setSelectedModelId(v === NO_MODEL_VALUE ? null : v)}
    >
      <SelectTrigger size="sm" className="h-7 gap-1 border-none bg-transparent px-2 text-xs shadow-none">
        <SelectValue placeholder="选择模型" />
      </SelectTrigger>
      <SelectContent>
        {enabledModels.length === 0 && <SelectItem value={NO_MODEL_VALUE}>未配置模型</SelectItem>}
        {[...grouped.entries()].map(([provider, items]) => (
          <SelectGroup key={provider}>
            <SelectLabel>{provider}</SelectLabel>
            {items.map((m) => {
              const caps = Object.entries(m.capabilities)
                .filter(([k, v]) => v && k !== "chat")
                .map(([k]) => k);
              return (
                <SelectItem key={m.id} value={m.id}>
                  <span className="flex items-center gap-1.5">
                    <span>{m.displayName || m.modelId}</span>
                    {caps.map((c) => (
                      <Badge
                        key={c}
                        variant="secondary"
                        className="px-1 py-0 text-[10px] leading-tight"
                      >
                        {capLabels[c] || c}
                      </Badge>
                    ))}
                  </span>
                </SelectItem>
              );
            })}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
