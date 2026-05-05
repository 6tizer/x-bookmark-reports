"use client";

/**
 * PipelineActions — 3 trigger buttons with expandable options
 */

import { useState } from "react";
import {
  RefreshCw,
  PenTool,
  CloudUpload,
  ChevronDown,
  Loader2,
} from "lucide-react";
import type { PipelineOperationType } from "@/types/api";

interface PipelineActionsProps {
  onTriggerSyncBookmarks: (opts?: {
    limit?: number;
    resume?: boolean;
  }) => Promise<void>;
  onTriggerArticlePipeline: (opts?: {
    mode?: "one" | "batch";
    tweetId?: string;
    limit?: number;
    resume?: boolean;
    model?: string;
  }) => Promise<void>;
  onTriggerNotionUpload: (opts?: {
    ids?: string;
    file?: string;
    limit?: number;
  }) => Promise<void>;
  isRunning: boolean;
  currentType: PipelineOperationType | null;
}

function ActionCard({
  label,
  icon,
  type,
  currentType,
  isRunning,
  onTrigger,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  type: PipelineOperationType;
  currentType: PipelineOperationType | null;
  isRunning: boolean;
  onTrigger: () => void;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const active = isRunning && currentType === type;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between p-3">
        <button
          type="button"
          onClick={onTrigger}
          disabled={isRunning}
          className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-twitter-blue disabled:opacity-50 transition-colors"
        >
          {active ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            icon
          )}
          {active ? `${label}...` : label}
        </button>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown
            size={14}
            className={`transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      </div>
      {expanded && <div className="border-t border-border p-3 space-y-2">{children}</div>}
    </div>
  );
}

export function PipelineActions({
  onTriggerSyncBookmarks,
  onTriggerArticlePipeline,
  onTriggerNotionUpload,
  isRunning,
  currentType,
}: PipelineActionsProps) {
  const [syncLimit, setSyncLimit] = useState("");
  const [syncResume, setSyncResume] = useState(false);

  const [pipelineLimit, setPipelineLimit] = useState("");
  const [pipelineResume, setPipelineResume] = useState(true);
  const [pipelineModel, setPipelineModel] = useState("");

  const [notionIds, setNotionIds] = useState("");

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground">Actions</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Sync Bookmarks */}
        <ActionCard
          label="Sync Bookmarks"
          icon={<RefreshCw size={16} />}
          type="sync_bookmarks"
          currentType={currentType}
          isRunning={isRunning}
          onTrigger={() =>
            onTriggerSyncBookmarks({
              limit: syncLimit ? Number(syncLimit) : undefined,
              resume: syncResume || undefined,
            })
          }
        >
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Limit
              <input
                type="number"
                min={1}
                value={syncLimit}
                onChange={(e) => setSyncLimit(e.target.value)}
                placeholder="all"
                className="w-20 rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={syncResume}
                onChange={(e) => setSyncResume(e.target.checked)}
                className="rounded"
              />
              Resume
            </label>
          </div>
        </ActionCard>

        {/* Run Pipeline */}
        <ActionCard
          label="Run Pipeline"
          icon={<PenTool size={16} />}
          type="article_pipeline"
          currentType={currentType}
          isRunning={isRunning}
          onTrigger={() =>
            onTriggerArticlePipeline({
              mode: "batch",
              limit: pipelineLimit ? Number(pipelineLimit) : undefined,
              resume: pipelineResume || undefined,
              model: pipelineModel || undefined,
            })
          }
        >
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Limit
              <input
                type="number"
                min={1}
                value={pipelineLimit}
                onChange={(e) => setPipelineLimit(e.target.value)}
                placeholder="all"
                className="w-20 rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={pipelineResume}
                onChange={(e) => setPipelineResume(e.target.checked)}
                className="rounded"
              />
              Resume
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Model
              <input
                type="text"
                value={pipelineModel}
                onChange={(e) => setPipelineModel(e.target.value)}
                placeholder="default"
                className="w-24 rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
              />
            </label>
          </div>
        </ActionCard>

        {/* Upload to Notion */}
        <ActionCard
          label="Upload to Notion"
          icon={<CloudUpload size={16} />}
          type="notion_upload"
          currentType={currentType}
          isRunning={isRunning}
          onTrigger={() =>
            onTriggerNotionUpload({
              ids: notionIds || undefined,
            })
          }
        >
          <div className="space-y-2">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Tweet IDs (comma-separated)
              <input
                type="text"
                value={notionIds}
                onChange={(e) => setNotionIds(e.target.value)}
                placeholder="e.g. 123,456,789"
                className="w-full rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
              />
            </label>
          </div>
        </ActionCard>
      </div>
    </div>
  );
}
