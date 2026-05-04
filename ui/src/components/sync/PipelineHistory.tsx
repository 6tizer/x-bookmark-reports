"use client";

/**
 * PipelineHistory — Table of past pipeline operations
 */

import { Trash2 } from "lucide-react";
import type { PipelineOperation, PipelineOperationType } from "@/types/api";

interface PipelineHistoryProps {
  history: PipelineOperation[];
  onClear: () => void;
}

const typeLabels: Record<PipelineOperationType, string> = {
  sync_bookmarks: "Sync Bookmarks",
  article_pipeline: "Article Pipeline",
  notion_upload: "Notion Upload",
};

function statusStyle(status: PipelineOperation["status"]): string {
  switch (status) {
    case "completed":
      return "text-green-500";
    case "running":
      return "text-twitter-blue";
    case "failed":
      return "text-red-500";
    default:
      return "text-muted-foreground";
  }
}

function formatDuration(start: string, end?: string): string {
  if (!end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

export function PipelineHistory({ history, onClear }: PipelineHistoryProps) {
  if (history.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">No history yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">History</h2>
        <button
          type="button"
          onClick={onClear}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-red-400 transition-colors"
        >
          <Trash2 size={12} />
          Clear
        </button>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Type</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Started</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Duration</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Command</th>
              </tr>
            </thead>
            <tbody>
              {history.map((op, i) => (
                <tr key={i} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2 text-foreground">
                    {typeLabels[op.type]}
                  </td>
                  <td className={`px-3 py-2 font-medium capitalize ${statusStyle(op.status)}`}>
                    {op.status}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {new Date(op.startedAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatDuration(op.startedAt, op.completedAt)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground font-mono truncate max-w-[200px]">
                    {op.command.slice(-2).join(" ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
