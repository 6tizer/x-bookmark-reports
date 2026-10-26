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
// 统一按产品时区（Asia/Singapore）展示日期
import { formatDateTime, formatTime } from "@/lib/format-date";
import { hasMessage, useT, type MessageKey, type TFunction } from "@/lib/i18n";

interface PipelineProps {
  pipeline: DashboardPipelineFour | null;
  batchProgress: BatchProgress | null;
  isLoading: boolean;
  onRefreshProgress?: () => void;
}

type NodeKey = keyof DashboardPipelineFour;

interface PipelineNodeDef {
  key: NodeKey;
  labelKey: MessageKey;
  icon: React.ReactNode;
}

const nodes: PipelineNodeDef[] = [
  { key: "twitterSync", labelKey: "dashboard.pipeline.node.twitterSync", icon: <RefreshCw size={16} /> },
  { key: "deepReports", labelKey: "dashboard.pipeline.node.deepReports", icon: <FileStack size={16} /> },
  { key: "rewrite", labelKey: "dashboard.pipeline.node.rewrite", icon: <PenTool size={16} /> },
  { key: "notionUpload", labelKey: "dashboard.pipeline.node.notionUpload", icon: <CloudUpload size={16} /> },
];

// 服务端返回的状态/步骤是英文代码，词典里找不到时原样显示
function translateCode(t: TFunction, prefix: string, code: string): string {
  const key = `${prefix}.${code}`;
  return hasMessage(key) ? t(key as MessageKey) : code;
}

function statusColor(status: PipelineStatus): string {
  switch (status) {
    case "completed":
      return "bg-green-500 text-white border-green-500";
    case "running":
      return "bg-twitter-blue text-white border-twitter-blue animate-pulse";
    case "partial":
      // 与 Sync PipelineOverview 一致：部分成功/失败
      return "bg-orange-500 text-white border-orange-500";
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
    case "partial":
      return "bg-orange-400";
    default:
      return "border-t-2 border-dashed border-border bg-transparent";
  }
}

function formatDuration(iso: string | undefined, t: TFunction): string {
  if (!iso) return "—";
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "—";
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return t("dashboard.time.secondsAgo", { n: sec });
  if (sec < 3600) return t("dashboard.time.minutesAgo", { n: Math.floor(sec / 60) });
  return t("dashboard.time.hoursAgo", { n: Math.floor(sec / 3600) });
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
  const t = useT();

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
        <h2 className="text-sm font-semibold text-foreground">{t("dashboard.pipeline.title")}</h2>
        <button
          type="button"
          onClick={() => setProgressOpen(!progressOpen)}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          {progressOpen ? t("dashboard.pipeline.hideProgress") : t("dashboard.pipeline.showProgress")}
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
                  {t(node.labelKey)}
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

      {(() => {
        // 默认始终显示：有全局进度且与本批不一致的阶段（rewrite / notionUpload）
        // 让用户不点节点就能看到「本批 100% / 全局 41%」的差异
        const stagesWithGlobal = nodes.filter((n) => {
          const d = pipeline[n.key];
          return (
            d.progressGlobal !== undefined &&
            d.progress !== undefined &&
            d.progressGlobal !== d.progress
          );
        });
        if (stagesWithGlobal.length === 0) return null;
        return (
          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-3 text-[11px]">
            {stagesWithGlobal.map((n) => {
              const d = pipeline[n.key];
              return (
                <div key={n.key} className="space-y-1.5">
                  <p className="font-medium text-foreground">{t(n.labelKey)}</p>
                  <ProgressBarRow label={t("dashboard.pipeline.batch")} progress={d.progress!} />
                  <ProgressBarRow label={t("dashboard.pipeline.global")} progress={d.progressGlobal!} />
                </div>
              );
            })}
          </div>
        );
      })()}

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
                  {t("dashboard.pipeline.details", {
                    name: t(nodes.find((n) => n.key === selectedNode)!.labelKey),
                  })}
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
                  {t("dashboard.pipeline.statusLabel")}{" "}
                  <span className="font-medium text-foreground capitalize">
                    {translateCode(t, "dashboard.pipeline.status", pipeline[selectedNode].status)}
                  </span>
                </p>
                {pipeline[selectedNode].lastRun && (
                  <p>
                    {t("dashboard.pipeline.lastRun")}{" "}
                    {formatDateTime(pipeline[selectedNode].lastRun!)}
                  </p>
                )}
                {pipeline[selectedNode].progress !== undefined && (
                  <div className="space-y-1.5">
                    <ProgressBarRow
                      label={t("dashboard.pipeline.batch")}
                      progress={pipeline[selectedNode].progress}
                    />
                    {pipeline[selectedNode].progressGlobal !== undefined &&
                      pipeline[selectedNode].progressGlobal !==
                        pipeline[selectedNode].progress && (
                        <ProgressBarRow
                          label={t("dashboard.pipeline.global")}
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
            <p className="text-xs font-medium text-foreground">{t("dashboard.progress.title")}</p>
            {onRefreshProgress && (
              <button
                type="button"
                onClick={onRefreshProgress}
                className="text-[11px] text-twitter-blue hover:underline"
              >
                {t("common.action.refresh")}
              </button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t("dashboard.progress.summary", {
              state: bp.isRunning ? t("dashboard.progress.running") : t("dashboard.progress.idle"),
              done: bp.completed,
              failed: bp.failed,
              queued: bp.pending + bp.researching,
            })}
          </p>
          <div className="h-2 rounded-full bg-border overflow-hidden">
            <div
              className="h-full bg-twitter-blue transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          {bp.isRunning && (
            <p className="text-[11px] text-muted-foreground">
              {t("dashboard.progress.current")}{" "}
              <span className="font-mono text-foreground">
                {bp.currentTweetId?.slice(0, 14)}…
              </span>{" "}
              ·{" "}
              {t("dashboard.progress.step", {
                step: bp.currentStep
                  ? translateCode(t, "dashboard.progress.stepName", bp.currentStep)
                  : "—",
              })}
              {bp.estimatedEnd && (
                <> · {t("dashboard.progress.estEnd", { time: formatTime(bp.estimatedEnd) })}</>
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
                  {translateCode(t, "dashboard.progress.itemStatus", it.status)} ·{" "}
                  {formatDuration(it.updatedAt, t)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
