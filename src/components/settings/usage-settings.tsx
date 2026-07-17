"use client";

import { useEffect } from "react";
import { useUsageStore } from "@/stores/usage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCost(n: number): string {
  return `$${n.toFixed(n < 1 ? 4 : 2)}`;
}

export function UsageSettings() {
  const { data, days, loading, fetchUsage } = useUsageStore();

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  const summary = data?.summary;
  const byDay = data?.byDay ?? [];
  const byModel = data?.byModel ?? [];
  const maxDayTokens = Math.max(1, ...byDay.map((d) => d.tokensIn + d.tokensOut));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium">用量统计</h2>
        <div className="flex items-center gap-2">
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <Select value={String(days)} onValueChange={(v) => fetchUsage(Number(v))}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">近 7 天</SelectItem>
              <SelectItem value="30">近 30 天</SelectItem>
              <SelectItem value="90">近 90 天</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="请求数" value={formatNumber(summary?.totalRequests ?? 0)} />
        <SummaryCard label="输入 Token" value={formatNumber(summary?.totalTokensIn ?? 0)} />
        <SummaryCard label="输出 Token" value={formatNumber(summary?.totalTokensOut ?? 0)} />
        <SummaryCard label="累计费用" value={formatCost(summary?.totalCost ?? 0)} />
      </div>

      <Card className="py-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">每日 Token 消耗</CardTitle>
        </CardHeader>
        <CardContent>
          {byDay.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无数据</p>
          ) : (
            <div className="flex h-40 items-end gap-1">
              {byDay.map((d) => {
                const total = d.tokensIn + d.tokensOut;
                const pct = Math.round((total / maxDayTokens) * 100);
                return (
                  <div key={d.date} className="flex flex-1 flex-col items-center gap-1" title={`${d.date}：${formatNumber(total)} tokens`}>
                    <div className="flex w-full flex-1 items-end">
                      <div
                        className="w-full rounded-t bg-primary/70 transition-all"
                        style={{ height: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground">{d.date.slice(5)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="py-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">按模型统计</CardTitle>
        </CardHeader>
        <CardContent>
          {byModel.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无数据</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-2 font-medium">模型</th>
                    <th className="py-2 pr-2 font-medium">服务商</th>
                    <th className="py-2 pr-2 text-right font-medium">请求</th>
                    <th className="py-2 pr-2 text-right font-medium">输入</th>
                    <th className="py-2 pr-2 text-right font-medium">输出</th>
                    <th className="py-2 text-right font-medium">费用</th>
                  </tr>
                </thead>
                <tbody>
                  {byModel.map((m, i) => (
                    <tr key={`${m.modelId}-${m.provider}-${i}`} className="border-b last:border-0">
                      <td className="py-2 pr-2">{m.modelId || "未知"}</td>
                      <td className="py-2 pr-2 text-muted-foreground">{m.provider || "-"}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{m.requests}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{formatNumber(m.tokensIn)}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{formatNumber(m.tokensOut)}</td>
                      <td className="py-2 text-right tabular-nums">{formatCost(m.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="py-3">
      <CardContent className="px-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
