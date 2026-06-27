"use client";

import { useCallback, useState } from "react";
import type { PipelineOperation } from "@/types/api";

interface UsePipelineReturn {
  currentOperation: PipelineOperation | null;
  isRunning: boolean;

  triggerSyncBookmarks: (opts?: {
    limit?: number;
    resume?: boolean;
  }) => Promise<void>;
  triggerArticlePipeline: (opts?: {
    mode?: "one" | "batch";
    tweetId?: string;
    limit?: number;
    resume?: boolean;
    model?: string;
  }) => Promise<void>;
  triggerNotionUpload: (opts?: {
    ids?: string;
    file?: string;
    limit?: number;
  }) => Promise<void>;
  // spawn 后保留 currentOperation 让 SyncTerminal 持续订阅 SSE；
  // 用户手动 clear 或新 trigger 时才清空
  clearCurrentOperation: () => void;
}

export function usePipeline(): UsePipelineReturn {
  const [currentOperation, setCurrentOperation] =
    useState<PipelineOperation | null>(null);

  // 手动清除 currentOperation（让 SyncTerminal 关闭 SSE）
  const clearCurrentOperation = useCallback(() => {
    setCurrentOperation(null);
  }, []);

  const triggerSyncBookmarks = useCallback(
    async (opts?: { limit?: number; resume?: boolean }) => {
      const op: PipelineOperation = {
        type: "sync_bookmarks",
        startedAt: new Date().toISOString(),
        status: "running",
        command: [],
        component: "coordinator",
      };
      setCurrentOperation(op);

      try {
        const res = await fetch("/api/pipeline/coordinator", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit: opts?.limit, resume: opts?.resume }),
        });
        const json = await res.json();

        if (!json.success) {
          setCurrentOperation(null);
          return;
        }

        // 保留 currentOperation 让 SyncTerminal 持续订阅 SSE 直到用户手动 clear
        const updated: PipelineOperation = {
          ...op,
          pid: json.data?.pid,
          command: json.data?.command ?? [],
        };
        setCurrentOperation(updated);
      } catch {
        setCurrentOperation(null);
      }
    },
    []
  );

  const triggerArticlePipeline = useCallback(
    async (opts?: {
      mode?: "one" | "batch";
      tweetId?: string;
      limit?: number;
      resume?: boolean;
      model?: string;
    }) => {
      const op: PipelineOperation = {
        type: "article_pipeline",
        startedAt: new Date().toISOString(),
        status: "running",
        command: [],
        component: "article_pipeline",
      };
      setCurrentOperation(op);

      try {
        const res = await fetch("/api/article-pipeline/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: opts?.mode,
            tweetId: opts?.tweetId,
            limit: opts?.limit,
            resume: opts?.resume,
            model: opts?.model,
          }),
        });
        const json = await res.json();

        if (!json.success) {
          setCurrentOperation(null);
          return;
        }

        const updated: PipelineOperation = {
          ...op,
          pid: json.data?.pid,
          command: json.data?.command ?? [],
        };
        setCurrentOperation(updated);
      } catch {
        setCurrentOperation(null);
      }
    },
    []
  );

  const triggerNotionUpload = useCallback(
    async (opts?: { ids?: string; file?: string; limit?: number }) => {
      const op: PipelineOperation = {
        type: "notion_upload",
        startedAt: new Date().toISOString(),
        status: "running",
        command: [],
        component: "notion_upload",
      };
      setCurrentOperation(op);

      try {
        const res = await fetch("/api/pipeline/notion-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ids: opts?.ids,
            file: opts?.file,
            limit: opts?.limit,
          }),
        });
        const json = await res.json();

        if (!json.success) {
          setCurrentOperation(null);
          return;
        }

        const updated: PipelineOperation = {
          ...op,
          pid: json.data?.pid,
          command: json.data?.command ?? [],
        };
        setCurrentOperation(updated);
      } catch {
        setCurrentOperation(null);
      }
    },
    []
  );

  return {
    currentOperation,
    isRunning: currentOperation !== null,
    triggerSyncBookmarks,
    triggerArticlePipeline,
    triggerNotionUpload,
    clearCurrentOperation,
  };
}
