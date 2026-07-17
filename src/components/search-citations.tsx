"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Globe } from "lucide-react";

interface Citation {
  title: string;
  url: string;
  snippet: string;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function SearchCitations({ results }: { results: Citation[] }) {
  const [open, setOpen] = useState(false);
  if (!results || results.length === 0) return null;

  return (
    <div className="mt-1 w-full max-w-full">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Globe className="h-3 w-3" />
        引用来源 ({results.length})
      </button>
      {open && (
        <div className="mt-1.5 flex flex-col gap-1.5">
          {results.map((r, i) => (
            <a
              key={`${r.url}-${i}`}
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border px-2.5 py-1.5 text-xs transition-colors hover:bg-accent"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">{i + 1}.</span>
                <span className="truncate font-medium">{r.title || hostOf(r.url)}</span>
              </div>
              <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{hostOf(r.url)}</div>
              {r.snippet && (
                <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{r.snippet}</p>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
