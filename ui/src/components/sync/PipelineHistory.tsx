"use client";

/**
 * PipelineHistory — 显示 output/auto_run_history.jsonl 的最近运行
 */

import { RefreshCw, Loader2, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { usePipelineHistory } from "@/hooks/usePipelineHistory";

// 状态映射为颜色 + 图标
function statusBadge(status: string): { color: string; icon: React.ReactNode } {
  if (status === "success") return { color: "text-green-500", icon: <CheckCircle size={12} /> };
  if (status === "failed") return { color: "text-red-500", icon: <XCircle size={12} /> };
  if (status === "partial") return { color: "text-yellow-500", icon: <AlertTriangle size={12} /> };
  return { color: "text-muted-foreground", icon: <Loader2 size={12} className="animate-spin" /> };
}

// 秒数格式化为 1m30s 风格
function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m${s.toString().padStart(2, "0")}s`;
}

interface PipelineHistoryProps {
  // 兼容老接口，但本 PR 起改为内部 fetch
  onClear?: () => void;
}

export function PipelineHistory(_: PipelineHistoryProps = {}) {
  const { items, total, isLoading, error, refresh } = usePipelineHistory(20);

  // 首次加载中且无数据
  if (isLoading && items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
        <Loader2 size={12} className="animate-spin" />
        Loading history...
      </div>
    );
  }

  // 加载失败且无数据
  if (error && items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <p className="text-xs text-red-500">Failed to load history: {error}</p>
        <button onClick={refresh} className="mt-2 text-xs text-twitter-blue hover:underline">
          Retry
        </button>
      </div>
    );
  }

  // 无历史记录
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">No history yet</p>
        <p className="text-[10px] text-muted-foreground mt-1">
          auto_run.sh 跑完后会写入 output/auto_run_history.jsonl
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          History
          <span className="ml-2 text-[11px] text-muted-foreground font-normal">
            {items.length} / {total}
          </span>
        </h2>
        <button
          type="button"
          onClick={refresh}
          disabled={isLoading}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          {isLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Refresh
        </button>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Started</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Duration</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Sync</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Process</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Article</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Notion</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Step / Error</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => {
                const badge = statusBadge(item.status);
                return (
                  <tr key={i} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-2">
                      <div className={`flex items-center gap-1 font-medium capitalize ${badge.color}`}>
                        {badge.icon}
                        {item.status}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {(() => {
                        try { return new Date(item.startedAt).toLocaleString(); }
                        catch { return item.startedAt; }
                      })()}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{formatDuration(item.durationSec)}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{item.syncNew || "—"}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{item.processNew || "—"}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{item.articleNew || "—"}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{item.uploadNew || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground font-mono truncate max-w-[200px]">
                      {item.error ? (
                        <span className="text-red-500" title={item.error}>
                          {item.error.slice(0, 60)}
                        </span>
                      ) : (
                        <span>{item.step}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
