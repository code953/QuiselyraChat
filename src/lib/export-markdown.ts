export interface ExportMessage {
  role: string;
  content: string;
  createdAt?: Date | string | number;
  searchResults?: Array<{ title: string; url: string; snippet?: string }> | null;
}

const ROLE_LABELS: Record<string, string> = {
  user: "用户",
  assistant: "助手",
  system: "系统",
  tool: "工具",
};

/**
 * 将一段会话转换为 Markdown 文本。
 */
export function conversationToMarkdown(title: string, messages: ExportMessage[]): string {
  const lines: string[] = [];
  lines.push(`# ${title || "对话"}`);
  lines.push("");
  lines.push(`> 导出时间：${new Date().toLocaleString("zh-CN")}`);
  lines.push("");

  for (const message of messages) {
    if (message.role === "system") continue;
    const label = ROLE_LABELS[message.role] ?? message.role;
    lines.push(`## ${label}`);
    lines.push("");
    lines.push(message.content?.trim() || "");
    lines.push("");

    if (message.searchResults && message.searchResults.length > 0) {
      lines.push("**引用来源：**");
      lines.push("");
      message.searchResults.forEach((r, i) => {
        lines.push(`${i + 1}. [${r.title || r.url}](${r.url})`);
      });
      lines.push("");
    }

    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * 触发浏览器下载一个 Markdown 文件（仅客户端调用）。
 */
export function downloadMarkdown(title: string, markdown: string) {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeTitle = (title || "对话").replace(/[\\/:*?"<>|]/g, "_").slice(0, 50);
  a.href = url;
  a.download = `${safeTitle}-${new Date().toISOString().slice(0, 10)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
