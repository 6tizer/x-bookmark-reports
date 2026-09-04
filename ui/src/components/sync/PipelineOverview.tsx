"use client";

/**
 * PipelineOverview — 4 pipeline nodes with status + progress bars
 */

import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw,
  FileStack,
  CloudUpload,
  PenTool,
} from "lucide-react";
import type { DashboardPipelineFour, PipelineStatus } from "@/types/api";
import { Skeleton } from "@/components/ui/Skeleton";
// 统一按产品时区（Asia/Singapore）展示日期
import { formatDateTime } from "@/lib/format-date";

type NodeKey = keyof DashboardPipelineFour;

interface PipelineNodeDef {
  key: NodeKey;
  label: string;
  icon: React.ReactNode;
}

const nodes: PipelineNodeDef[] = [
  { key: "twitterSync", label: "Twitter Sync", icon: <RefreshCw size={16} /> },
  { key: "deepReports", label: "Deep Reports", icon: <FileStack size={16} /> },
  { key: "rewrite", label: "Rewrite", icon: <PenTool size={16} /> },
  { key: "notionUpload", label: "Notion Upload", icon: <CloudUpload size={16} /> },
];

function statusColor(status: PipelineStatus): string {
  switch (status) {
    case "completed":
      return "bg-green-500 text-white border-green-500";
    case "running":
      return "bg-twitter-blue text-white border-twitter-blue animate-pulse";
    case "partial":
      return "bg-orange-500 text-white border-orange-500";
    case "failed":
      return "bg-red-500 text-white border-red-500";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function statusBadge(status: PipelineStatus): string {
  switch (status) {
    case "completed":
      return "text-green-500";
    case "running":
      return "text-twitter-blue";
    case "partial":
      return "text-orange-500";
    case "failed":
      return "text-red-500";
    default:
      return "text-muted-foreground";
  }
}

export function PipelineOverview() {
  const [pipeline, setPipeline] = useState<DashboardPipelineFour | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPipeline = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/stats");
      const json = await res.json();
      if (json.success && json.data?.pipeline) {
        setPipeline(json.data.pipeline);
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPipeline();
    const t = setInterval(fetchPipeline, 30_000);
    return () => clearInterval(t);
  }, [fetchPipeline]);

  if (isLoading || !pipeline) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <Skeleton className="h-5 w-40 mb-4" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Pipeline Status</h2>
        <button
          type="button"
          onClick={fetchPipeline}
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {nodes.map((node) => {
          const data = pipeline[node.key];
          const progress = data.progress ?? 0;

          return (
            <div
              key={node.key}
              className="rounded-md border border-border bg-muted/30 p-3 space-y-2"
            >
              <div className="flex items-center gap-2">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full border-2 ${statusColor(
                    data.status
                  )}`}
                >
                  {node.icon}
                </div>
                <span className="text-xs font-medium text-foreground truncate">
                  {node.label}
                </span>
              </div>

              <span
                className={`text-[10px] font-medium capitalize ${statusBadge(
                  data.status
                )}`}
              >
                {data.status}
              </span>

              {data.status === "running" && (
                <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
                  <div
                    className="h-full bg-twitter-blue transition-all duration-500"
                    style={{ width: `${Math.min(progress, 100)}%` }}
                  />
                </div>
              )}

              {data.lastRun && (
                <p className="text-[10px] text-muted-foreground">
                  {formatDateTime(data.lastRun)}
                </p>
              )}

              {data.error && (
                <p className="text-[10px] text-red-400 truncate" title={data.error.message}>
                  {data.error.message}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
