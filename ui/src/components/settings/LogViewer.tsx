"use client";

/**
 * LogViewer — Filterable log table
 */

import { Filter, RefreshCw } from "lucide-react";
import type { LogEntry, LogLevel, LogComponent } from "@/types/api";
import { Skeleton } from "@/components/ui/Skeleton";

interface LogViewerProps {
  logs: LogEntry[];
  isLoading: boolean;
  component: LogComponent | undefined;
  level: LogLevel | undefined;
  onComponentChange: (c: LogComponent | undefined) => void;
  onLevelChange: (l: LogLevel | undefined) => void;
  onRefresh: () => void;
}

const components: LogComponent[] = ["sync", "x-reader", "x-tweet-reader", "agent", "system", "coordinator", "article_pipeline", "notion_upload"];
const levels: LogLevel[] = ["info", "warn", "error"];

export function LogViewer({
  logs,
  isLoading,
  component,
  level,
  onComponentChange,
  onLevelChange,
  onRefresh,
}: LogViewerProps) {
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
        {/* Row 1: Component */}
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
          {components.map((c) => (
            <button
              key={c}
              onClick={() => onComponentChange(c)}
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
                    {new Date(log.timestamp).toLocaleTimeString()}
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
