"use client";

/**
 * LogViewer — Filterable log table with pagination
 *
 * 关键改动（PR-2 Stage 2）：
 * - Component 列表改为动态拉取 /api/logs/components，删除硬编码 dead category
 * - Time 列显示完整日期 (toLocaleString)，不再只显示 HH:MM:SS
 * - 底部新增翻页 UI：Showing N of total · Previous / Page N / Next
 */

import { useEffect, useState } from "react";
import { Filter, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import type { LogEntry, LogLevel, LogComponent } from "@/types/api";
import { Skeleton } from "@/components/ui/Skeleton";
// 统一按产品时区（Asia/Singapore）展示日期
import { formatDateTime } from "@/lib/format-date";

interface LogViewerProps {
  logs: LogEntry[];
  isLoading: boolean;
  total: number;
  page: number;
  hasMore: boolean;
  component: LogComponent | undefined;
  level: LogLevel | undefined;
  onComponentChange: (c: LogComponent | undefined) => void;
  onLevelChange: (l: LogLevel | undefined) => void;
  onPageChange: (page: number) => void;
  onRefresh: () => void;
}

const levels: LogLevel[] = ["info", "warn", "error"];

export function LogViewer({
  logs,
  isLoading,
  total,
  page,
  hasMore,
  component,
  level,
  onComponentChange,
  onLevelChange,
  onPageChange,
  onRefresh,
}: LogViewerProps) {
  // 动态 component 列表：从 DB distinct 读取，避免硬编码 dead category
  const [availableComponents, setAvailableComponents] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.get<{ components: string[] }>("/logs/components");
        if (!cancelled) setAvailableComponents(data.components);
      } catch (err) {
        // 拉取失败时保留空数组，过滤条仅显示 "All"，不影响 logs 表格
        console.error("[LogViewer] fetch components failed:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading && logs.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-5 w-16 rounded" />
            <Skeleton className="h-5 w-12 rounded" />
            <Skeleton className="h-4 flex-1" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filters — 强制两行：Component 与 Level/Refresh 分两行，避免按钮过多挤一行 */}
      <div className="space-y-2">
        {/* Row 1: Component（动态来自 DB，不再硬编码） */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
            <Filter size={12} />
            <span>Component:</span>
          </div>
          <button
            onClick={() => onComponentChange(undefined)}
            className={`rounded-md border border-border px-2 py-0.5 text-[11px] transition-colors ${
              !component ? "bg-twitter-blue text-white border-twitter-blue" : "hover:bg-muted"
            }`}
          >
            All
          </button>
          {availableComponents.map((c) => (
            <button
              key={c}
              onClick={() => onComponentChange(c as LogComponent)}
              className={`rounded-md border border-border px-2 py-0.5 text-[11px] transition-colors ${
                component === c ? "bg-twitter-blue text-white border-twitter-blue" : "hover:bg-muted"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Row 2: Level + Refresh */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
            <span>Level:</span>
          </div>
          <button
            onClick={() => onLevelChange(undefined)}
            className={`rounded-md border border-border px-2 py-0.5 text-[11px] transition-colors ${
              !level ? "bg-twitter-blue text-white border-twitter-blue" : "hover:bg-muted"
            }`}
          >
            All
          </button>
          {levels.map((l) => (
            <button
              key={l}
              onClick={() => onLevelChange(l)}
              className={`rounded-md border border-border px-2 py-0.5 text-[11px] capitalize transition-colors ${
                level === l ? "bg-twitter-blue text-white border-twitter-blue" : "hover:bg-muted"
              }`}
            >
              {l}
            </button>
          ))}

          <button
            onClick={onRefresh}
            className="ml-auto flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] hover:bg-muted transition-colors"
          >
            <RefreshCw size={11} />
            Refresh
          </button>
        </div>
      </div>

      {/* Log table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-3 py-2 text-left font-medium text-muted-foreground text-[11px]">Time</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground text-[11px]">Component</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground text-[11px]">Level</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground text-[11px]">Message</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No logs found
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                  <td className="px-3 py-2 whitespace-nowrap text-[11px] text-muted-foreground font-mono">
                    {formatDateTime(log.timestamp)}
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                      {log.component}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <LevelBadge level={log.level} />
                  </td>
                  <td className="px-3 py-2">
                    <p className="text-xs text-foreground">{log.message}</p>
                    {log.detail && (
                      <p className="mt-0.5 text-[10px] text-muted-foreground font-mono">{log.detail}</p>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 翻页控件 — 仿 Articles 页：Showing N of total · Previous / Page N / Next */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Showing {logs.length} of {total}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50 transition-colors"
          >
            Previous
          </button>
          <span className="px-2 text-xs text-muted-foreground">Page {page}</span>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={!hasMore}
            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50 transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

function LevelBadge({ level }: { level: LogLevel }) {
  const colors: Record<LogLevel, string> = {
    info: "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
    warn: "bg-yellow-50 text-yellow-600 dark:bg-yellow-950 dark:text-yellow-400",
    error: "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400",
  };

  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${colors[level]}`}>
      {level}
    </span>
  );
}
