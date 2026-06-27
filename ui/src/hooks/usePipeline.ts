"use client";

import { useCallback, useState, useEffect, useRef } from "react";
import type { PipelineOperation } from "@/types/api";

const HISTORY_KEY = "pipeline-operation-history";
const MAX_HISTORY = 50;

interface UsePipelineReturn {
  currentOperation: PipelineOperation | null;
  history: PipelineOperation[];
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
  clearHistory: () => void;
  // spawn 后保留 currentOperation 让 SyncTerminal 持续订阅 SSE；
  // 用户手动 clear 或新 trigger 时才清空
  clearCurrentOperation: () => void;
}

function loadHistory(): PipelineOperation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PipelineOperation[];
  } catch {
    return [];
  }
}

function saveHistory(items: PipelineOperation[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY)));
  } catch {
    // localStorage full or unavailable — ignore
  }
}

export function usePipeline(): UsePipelineReturn {
  const [currentOperation, setCurrentOperation] =
    useState<PipelineOperation | null>(null);
  const [history, setHistory] = useState<PipelineOperation[]>([]);
  const mounted = useRef(false);

  // Load history from localStorage on mount
  useEffect(() => {
    setHistory(loadHistory());
    mounted.current = true;
  }, []);

  const addToHistory = useCallback(
    (op: PipelineOperation) => {
      setHistory((prev) => {
        const next = [op, ...prev].slice(0, MAX_HISTORY);
        saveHistory(next);
        return next;
      });
    },
    []
  );

  const clearHistory = useCallback(() => {
    setHistory([]);
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {
      // ignore
    }
  }, []);

  // 手动清除 currentOperation（让 SyncTerminal 关闭 SSE）。
  // 不影响 history（spawn 时已 addToHistory）。
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
          const failed: PipelineOperation = {
            ...op,
            status: "failed",
            completedAt: new Date().toISOString(),
            error: json.error?.message ?? "Unknown error",
          };
          setCurrentOperation(null);
          addToHistory(failed);
          return;
        }

        const updated: PipelineOperation = {
          ...op,
          pid: json.data?.pid,
          command: json.data?.command ?? [],
        };
        // 保留 currentOperation 让 SyncTerminal 持续订阅 SSE 直到用户手动 clear
        setCurrentOperation(updated);

        // spawn 成功即记入 history（保留原语义，但 currentOperation 不清空）
        const completed: PipelineOperation = {
          ...updated,
          status: "completed",
          completedAt: new Date().toISOString(),
        };
        addToHistory(completed);
      } catch (err) {
        const failed: PipelineOperation = {
          ...op,
          status: "failed",
          completedAt: new Date().toISOString(),
          error: err instanceof Error ? err.message : "Unknown error",
        };
        setCurrentOperation(null);
        addToHistory(failed);
      }
    },
    [addToHistory]
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
          const failed: PipelineOperation = {
            ...op,
            status: "failed",
            completedAt: new Date().toISOString(),
            error: json.error?.message ?? "Unknown error",
          };
          setCurrentOperation(null);
          addToHistory(failed);
          return;
        }

        const updated: PipelineOperation = {
          ...op,
          pid: json.data?.pid,
          command: json.data?.command ?? [],
        };
        // 保留 currentOperation 让 SyncTerminal 持续订阅 SSE
        setCurrentOperation(updated);

        const completed: PipelineOperation = {
          ...updated,
          status: "completed",
          completedAt: new Date().toISOString(),
        };
        addToHistory(completed);
      } catch (err) {
        const failed: PipelineOperation = {
          ...op,
          status: "failed",
          completedAt: new Date().toISOString(),
          error: err instanceof Error ? err.message : "Unknown error",
        };
        setCurrentOperation(null);
        addToHistory(failed);
      }
    },
    [addToHistory]
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
          const failed: PipelineOperation = {
            ...op,
            status: "failed",
            completedAt: new Date().toISOString(),
            error: json.error?.message ?? "Unknown error",
          };
          setCurrentOperation(null);
          addToHistory(failed);
          return;
        }

        const updated: PipelineOperation = {
          ...op,
          pid: json.data?.pid,
          command: json.data?.command ?? [],
        };
        // 保留 currentOperation 让 SyncTerminal 持续订阅 SSE
        setCurrentOperation(updated);

        const completed: PipelineOperation = {
          ...updated,
          status: "completed",
          completedAt: new Date().toISOString(),
        };
        addToHistory(completed);
      } catch (err) {
        const failed: PipelineOperation = {
          ...op,
          status: "failed",
          completedAt: new Date().toISOString(),
          error: err instanceof Error ? err.message : "Unknown error",
        };
        setCurrentOperation(null);
        addToHistory(failed);
      }
    },
    [addToHistory]
  );

  return {
    currentOperation,
    history,
    isRunning: currentOperation !== null,
    triggerSyncBookmarks,
    triggerArticlePipeline,
    triggerNotionUpload,
    clearHistory,
    clearCurrentOperation,
  };
}
