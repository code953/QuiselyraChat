"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MarkdownRendererProps {
  content: string;
}

function extractText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (node && typeof node === "object" && "props" in node) {
    const element = node as React.ReactElement<{ children?: React.ReactNode }>;
    return extractText(element.props.children);
  }
  return "";
}

/** 从 highlight.js 生成的 className 中取出语言名，用于代码块标题 */
function extractLanguage(node: React.ReactNode): string {
  if (!node || typeof node !== "object" || !("props" in node)) return "";
  const element = node as React.ReactElement<{ className?: string }>;
  const className = element.props.className || "";
  const match = /language-([\w+#-]+)/.exec(className);
  return match?.[1] ?? "";
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const text = useMemo(() => extractText(children).replace(/\n$/, ""), [children]);
  const language = useMemo(() => extractLanguage(children), [children]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // 无剪贴板权限时静默失败
    }
  }, [text]);

  return (
    <div className="group/code my-3 overflow-hidden rounded-xl border bg-muted/40">
      {/* 标题条承载语言名与复制按钮，避免按钮浮在代码上方遮挡首行 */}
      <div className="flex items-center justify-between border-b bg-muted/60 px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
          {language || "code"}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/code:opacity-100"
          onClick={handleCopy}
          aria-label="复制代码"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "已复制" : "复制"}
        </Button>
      </div>
      <pre className="overflow-x-auto p-3.5 text-[13px] leading-relaxed">{children}</pre>
    </div>
  );
}

const markdownComponents: Components = {
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  code: ({ children, className, ...props }) => {
    const isInline = !className || !String(className).includes("hljs");
    if (isInline) {
      return (
        <code
          className="rounded border bg-muted px-1 py-0.5 font-mono text-[0.875em]"
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code className={`${className} font-mono`} {...props}>
        {children}
      </code>
    );
  },
  a: ({ children, ...props }) => (
    <a
      className="font-medium text-primary underline decoration-primary/40 underline-offset-2 transition-colors hover:decoration-primary"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  ),
  // 宽表格在自己的容器里横向滚动，不让整页出现横向滚动条
  table: ({ children, ...props }) => (
    <div className="my-3 w-full overflow-x-auto rounded-lg border">
      <table className="w-full border-collapse text-[13px]" {...props}>
        {children}
      </table>
    </div>
  ),
  img: ({ ...props }) => (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img className="my-2 max-w-full rounded-lg border" loading="lazy" decoding="async" {...props} />
  ),
};

const PROSE_CLASSES = [
  "max-w-none break-words text-sm leading-7",
  "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
  "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/30 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
  "[&_h1]:mb-3 [&_h1]:mt-5 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:tracking-tight",
  "[&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-tight",
  "[&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:font-semibold",
  "[&_hr]:my-5 [&_hr]:border-border",
  "[&_li]:my-1 [&_li::marker]:text-muted-foreground",
  "[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5",
  "[&_p]:my-2",
  "[&_td]:border [&_td]:px-2.5 [&_td]:py-1.5 [&_td]:align-top",
  "[&_th]:border [&_th]:bg-muted [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-medium",
].join(" ");

const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [rehypeHighlight];

function MarkdownRendererImpl({ content }: MarkdownRendererProps) {
  return (
    <div className={PROSE_CLASSES}>
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Markdown 解析 + 语法高亮是消息渲染中最重的一步。
 * 内容未变时跳过整棵子树的重建（插件数组与 components 已提到模块级，
 * 保证引用稳定，否则记忆化会被每次新建的对象破坏）。
 */
export const MarkdownRenderer = memo(
  MarkdownRendererImpl,
  (prev, next) => prev.content === next.content
);
