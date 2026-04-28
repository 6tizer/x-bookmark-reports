"use client";

/**
 * useSync — Sync job creation, SSE connection handling
 */

import { useCallback, useEffect, useRef } from "react";
import { useSyncStore } from "@/store/useSyncStore";
import { startSync, getSyncJob, getSyncHistory, connectSyncSSE } from "@/lib/api";
import type { SyncMode, SyncJob, SSEEvent } from "@/types/api";

interface UseSyncReturn {
  syncJobs: SyncJob[];
  currentJob: SyncJob | null;
  isSyncing: boolean;
  isLoading: boolean;

  triggerSync: (mode?: SyncMode) => Promise<void>;
  fetchHistory: () => Promise<void>;
}

export function useSync(): UseSyncReturn {
  const store = useSyncStore();
  const disconnectRef = useRef<(() => void) | null>(null);

  const fetchHistory = useCallback(async () => {
    store.setIsLoading(true);
    try {
      const res = await getSyncHistory();
      store.setSyncJobs(res.items);
    } finally {
      store.setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const triggerSync = useCallback(
    async (mode: SyncMode = "incremental") => {
      const res = await startSync(mode);
      const job = await getSyncJob(res.jobId);
      store.setCurrentJob(job);

      if (disconnectRef.current) {
        disconnectRef.current();
      }

      disconnectRef.current = connectSyncSSE(res.jobId, (event: SSEEvent) => {
        switch (event.type) {
          case "progress": {
            const payload = event.payload as {
              percent: number;
              stage: SyncJob["stage"];
              logs: string[];
              newCount?: number;
              totalCount?: number;
            };
            store.updateCurrentJob({
              progress: payload.percent,
              stage: payload.stage,
              newCount: payload.newCount ?? store.currentJob?.newCount ?? 0,
              totalCount: payload.totalCount ?? store.currentJob?.totalCount ?? 0,
            });
            payload.logs.forEach((log) => store.addLogToCurrentJob(log));
            break;
          }
          case "complete": {
            const payload = event.payload as {
              newCount: number;
              totalCount: number;
              completedAt: string;
            };
            store.updateCurrentJob({
              status: "completed",
              progress: 100,
              stage: "done",
              newCount: payload.newCount,
              totalCount: payload.totalCount,
              completedAt: payload.completedAt,
            });
            store.setIsSyncing(false);
            break;
          }
          case "error": {
            const payload = event.payload as {
              code: string;
              message: string;
              detail?: string;
            };
            store.updateCurrentJob({
              status: "failed",
              error: { code: payload.code, message: payload.message, detail: payload.detail },
            });
            store.setIsSyncing(false);
            break;
          }
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store]
  );

  useEffect(() => {
    return () => {
      if (disconnectRef.current) {
        disconnectRef.current();
      }
    };
  }, []);

  return {
    syncJobs: store.syncJobs,
    currentJob: store.currentJob,
    isSyncing: store.isSyncing,
    isLoading: store.isLoading,
    triggerSync,
    fetchHistory,
  };
}
