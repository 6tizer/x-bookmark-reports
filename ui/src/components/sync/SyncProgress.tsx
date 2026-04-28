"use client";

/**
 * SyncProgress — Progress bar + stage indicator
 */

import type { PipelineStage, SyncStatus } from "@/types/api";

interface SyncProgressProps {
  status: SyncStatus;
  progress: number;
  stage: PipelineStage;
}

const stageLabels: Record<PipelineStage, string> = {
  auth: "Authenticating",
  fetching: "Fetching bookmarks",
  parsing: "Parsing data",
  storing: "Storing results",
  done: "Complete",
};

const stageOrder: PipelineStage[] = ["auth", "fetching", "parsing", "storing", "done"];

export function SyncProgress({ status, progress, stage }: SyncProgressProps) {
  const currentStageIndex = stageOrder.indexOf(stage);

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground capitalize">{status}</span>
        <span className="text-sm font-semibold text-twitter-blue">{Math.round(progress)}%</span>
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-twitter-blue transition-all duration-500"
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>

      {/* Stage indicators */}
      <div className="flex items-center justify-between">
        {stageOrder.map((s, i) => {
          const isDone = i < currentStageIndex;
          const isCurrent = i === currentStageIndex;
          const isPending = i > currentStageIndex;

          return (
            <div key={s} className="flex flex-col items-center gap-1 flex-1">
              <div
                className={`h-2 w-2 rounded-full transition-colors ${
                  isDone
                    ? "bg-green-500"
                    : isCurrent
                    ? "bg-twitter-blue animate-pulse"
                    : "bg-muted"
                }`}
              />
              <span
                className={`text-[10px] ${
                  isCurrent
                    ? "text-twitter-blue font-medium"
                    : isDone
                    ? "text-green-500"
                    : "text-muted-foreground"
                }`}
              >
                {stageLabels[s]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
