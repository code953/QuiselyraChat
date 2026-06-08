"use client";

import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePersonaStore } from "@/stores/persona";
import { useConversationStore } from "@/stores/conversation";

export function PersonaSelector() {
  const { personas, fetchPersonas } = usePersonaStore();
  const { currentId, setPersona } = useConversationStore();
  const [changing, setChanging] = useState(false);
  const currentConv = useConversationStore((s) =>
    s.conversations.find((c) => c.id === s.currentId)
  );

  useEffect(() => {
    fetchPersonas();
  }, [fetchPersonas]);

  const handleChange = async (value: string) => {
    if (!currentId) return;
    setChanging(true);
    try {
      await setPersona(currentId, value === "__none__" ? null : value);
    } finally {
      setChanging(false);
    }
  };

  return (
    <Select
      value={currentConv?.personaId ?? "__none__"}
      onValueChange={handleChange}
      disabled={!currentId || changing}
    >
      <SelectTrigger size="sm" className="h-7 gap-1 border-none bg-transparent px-2 text-xs shadow-none">
        <SelectValue placeholder="无人格" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">无人格</SelectItem>
        {personas.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            <span className="flex items-center gap-1.5">
              <span>{p.avatar}</span>
              <span>{p.name}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
