"use client";

/**
 * Pipeline — 4 nodes + batch progress panel
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  RefreshCw,
  FileStack,
  CloudUpload,
  X,
  PenTool,
} from "lucide-react";
import type { BatchProgress, DashboardPipelineFour, PipelineStatus } from "@/types/api";
import { Skeleton } from "@/components/ui/Skeleton";

interface PipelineProps {
  pipeline: DashboardPipelineFour | null;
  batchProgress: BatchProgress | null;
  isLoading: boolean;
  onRefreshProgress?: () => void;
}

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
  { key: "notionUpload", label: "Notion", icon: <CloudUpload size={16} /> },
];

function statusColor(status: PipelineStatus): string {
  switch (status) {
    case "completed":
      return "bg-green-500 text-white border-green-500";
    case "running":
      return "bg-twitter-blue text-white border-twitter-blue animate-pulse";
    case "failed":
      return "bg-red-500 text-white border-red-500";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function lineStyle(status: PipelineStatus): string {
  switch (status) {
    case "completed":
      return "bg-green-400";
    case "running":
      return "bg-twitter-blue pipeline-line-active";
    default:
      return "border-t-2 border-dashed border-border bg-transparent";
  }
}

function formatDuration(iso?: string): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const sec = Math.floor((Date.now() - t) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

// 单行进度条：label + 百分比 + 横向 progress bar
function ProgressBarRow({ label, progress }: { label: string; progress: number }) {
  const pct = Math.max(0, Math.min(100, progress));
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium text-foreground">{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-border overflow-hidden">
        <div
          className="h-full bg-twitter-blue transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function Pipeline({
  pipeline,
  batchProgress,
  isLoading,
  onRefreshProgress,
}: PipelineProps) {
  const [selectedNode, setSelectedNode] = useState<NodeKey | null>(null);
  const [progressOpen, setProgressOpen] = useState(true);

  if (isLoading || !pipeline) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <Skeleton className="h-5 w-32 mb-4" />
        <div className="flex flex-wrap items-center gap-1 justify-between">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-1 flex-1 min-w-[4rem]">
              <Skeleton className="h-9 w-9 rounded-full shrink-0" />
              {i < 3 && <Skeleton className="h-1 flex-1 min-w-[8px] hidden sm:block" />}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const bp = batchProgress;
  const pct =
    bp && bp.totalInBatch > 0
      ? Math.min(100, Math.round(((bp.completed + bp.failed) / bp.totalInBatch) * 100))
      : 0;

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Pipeline</h2>
        <button
          type="button"
          onClick={() => setProgressOpen(!progressOpen)}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          {progressOpen ? "Hide progress" : "Show progress"}
        </button>
      </div>

      <div className="flex flex-wrap items-start gap-y-3">
        {nodes.map((node, i) => {
          const data = pipeline[node.key];
          const isLast = i === nodes.length - 1;
          return (
            <div key={node.key} className="flex items-center flex-1 min-w-[4.5rem] max-w-[7rem] sm:max-w-none">
              <button
                type="button"
                onClick={() =>
                  setSelectedNode(selectedNode === node.key ? null : node.key)
                }
                className="flex flex-col items-center gap-1 group"
              >
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all ${statusColor(
                    data.status
                  )}`}
                >
                  {node.icon}
                </div>
                <span className="text-[10px] font-medium text-muted-foreground group-hover:text-foreground transition-colors text-center max-w-[5rem] leading-tight">
                  {node.label}
                </span>
              </button>

              {!isLast && (
                <div className="flex-1 mx-1 min-w-[4px] h-0.5 relative hidden sm:block">
                  <div
                    className={`absolute inset-0 rounded-full ${lineStyle(data.status)}`}
                  />
                  {data.status === "running" && (
                    <motion.div
                      className="absolute top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-white shadow"
                      animate={{ left: ["0%", "100%"] }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <AnimatePresence>
        {selectedNode && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-md border border-border bg-muted p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium">
                  {nodes.find((n) => n.key === selectedNode)?.label} — details
                </p>
                <button
                  type="button"
                  onClick={() => setSelectedNode(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="mt-2 space-y-2 text-[11px] text-muted-foreground">
                <p>
                  Status:{" "}
                  <span className="font-medium text-foreground capitalize">
                    {pipeline[selectedNode].status}
                  </span>
                </p>
                {pipeline[selectedNode].lastRun && (
                  <p>
                    Last run:{" "}
                    {new Date(pipeline[selectedNode].lastRun!).toLocaleString()}
                  </p>
                )}
                {pipeline[selectedNode].progress !== undefined && (
                  <div className="space-y-1.5">
                    <ProgressBarRow
                      label="本批"
                      progress={pipeline[selectedNode].progress}
                    />
                    {pipeline[selectedNode].progressGlobal !== undefined &&
                      pipeline[selectedNode].progressGlobal !==
                        pipeline[selectedNode].progress && (
                        <ProgressBarRow
                          label="全局"
                          progress={pipeline[selectedNode].progressGlobal!}
                        />
                      )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {progressOpen && bp && (
        <div className="rounded-md border border-border bg-muted/50 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-foreground">Article pipeline progress</p>
            {onRefreshProgress && (
              <button
                type="button"
                onClick={onRefreshProgress}
                className="text-[11px] text-twitter-blue hover:underline"
              >
                Refresh
              </button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {bp.isRunning ? "Running" : "Idle"} · {bp.completed} done · {bp.failed}{" "}
            failed · {bp.pending + bp.researching} queued / in-progress
          </p>
          <div className="h-2 rounded-full bg-border overflow-hidden">
            <div
              className="h-full bg-twitter-blue transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          {bp.isRunning && (
            <p className="text-[11px] text-muted-foreground">
              Current:{" "}
              <span className="font-mono text-foreground">
                {bp.currentTweetId?.slice(0, 14)}…
              </span>{" "}
              · step {bp.currentStep ?? "—"}
              {bp.estimatedEnd && (
                <> · est. end {new Date(bp.estimatedEnd).toLocaleTimeString()}</>
              )}
            </p>
          )}
          <div className="max-h-40 overflow-y-auto space-y-1 text-[10px] border-t border-border pt-2">
            {bp.items.slice(0, 20).map((it) => (
              <div
                key={it.tweetId}
                className="flex justify-between gap-2 text-muted-foreground"
              >
                <span className="truncate">
                  {(it.title || it.tweetId).slice(0, 36)}
                  {(it.title || it.tweetId).length > 36 ? "…" : ""}
                </span>
                <span className="shrink-0">
                  {it.status} · {formatDuration(it.updatedAt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
