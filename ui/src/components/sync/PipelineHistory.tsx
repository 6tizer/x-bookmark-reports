"use client";

/**
 * PipelineHistory — 显示 output/auto_run_history.jsonl 的最近运行
 */

import { RefreshCw, Loader2, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { usePipelineHistory } from "@/hooks/usePipelineHistory";
// 统一按产品时区（Asia/Singapore）展示日期
import { formatDateTime } from "@/lib/format-date";
import { useT, hasMessage, type MessageKey, type TFunction } from "@/lib/i18n";

// 状态映射为颜色 + 图标
function statusBadge(status: string): { color: string; icon: React.ReactNode } {
  if (status === "success") return { color: "text-green-500", icon: <CheckCircle size={12} /> };
  if (status === "failed") return { color: "text-red-500", icon: <XCircle size={12} /> };
  if (status === "partial") return { color: "text-yellow-500", icon: <AlertTriangle size={12} /> };
  return { color: "text-muted-foreground", icon: <Loader2 size={12} className="animate-spin" /> };
}

// 未知状态（服务端新增值）回退显示原文
function statusLabel(status: string, t: TFunction): string {
  const key = `sync.history.status.${status}`;
  return hasMessage(key) ? t(key as MessageKey) : status;
}

// 秒数格式化为 1m30s 风格
function formatDuration(sec: number, t: TFunction): string {
  if (sec < 60) return t("sync.history.durationSec", { s: sec });
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return t("sync.history.durationMin", { m, s: s.toString().padStart(2, "0") });
}

interface PipelineHistoryProps {
  // 兼容老接口，但本 PR 起改为内部 fetch
  onClear?: () => void;
}

export function PipelineHistory(_: PipelineHistoryProps = {}) {
  const t = useT();
  const { items, total, isLoading, error, refresh } = usePipelineHistory(20);

  // 首次加载中且无数据
  if (isLoading && items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
        <Loader2 size={12} className="animate-spin" />
        {t("sync.history.loading")}
      </div>
    );
  }

  // 加载失败且无数据
  if (error && items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <p className="text-xs text-red-500">{t("sync.history.loadFailed", { error })}</p>
        <button onClick={refresh} className="mt-2 text-xs text-twitter-blue hover:underline">
          {t("common.action.retry")}
        </button>
      </div>
    );
  }

  // 无历史记录
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">{t("sync.history.empty")}</p>
        <p className="text-[10px] text-muted-foreground mt-1">
          {t("sync.history.emptyHint")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          {t("sync.history.title")}
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
          {t("common.action.refresh")}
        </button>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("sync.history.col.status")}</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("sync.history.col.started")}</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("sync.history.col.duration")}</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">{t("sync.history.col.sync")}</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">{t("sync.history.col.process")}</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">{t("sync.history.col.article")}</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">{t("sync.history.col.notion")}</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("sync.history.col.stepError")}</th>
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
                        {statusLabel(item.status, t)}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {(() => {
                        try { return formatDateTime(item.startedAt, item.startedAt); }
                        catch { return item.startedAt; }
                      })()}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{formatDuration(item.durationSec, t)}</td>
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
