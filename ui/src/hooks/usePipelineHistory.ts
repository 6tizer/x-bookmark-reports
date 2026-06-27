"use client";

import { useCallback, useEffect, useState } from "react";

/** 与 /api/pipeline/history 一致的数据契约 */
export interface PipelineHistoryItem {
  startedAt: string;
  status: "success" | "failed" | "partial" | "running";
  step: string;
  syncNew: number;
  processNew: number;
  articleNew: number;
  uploadNew: number;
  error: string | null;
  durationSec: number;
}

interface UsePipelineHistoryReturn {
  items: PipelineHistoryItem[];
  total: number;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

// 从 /api/pipeline/history 拉取 auto_run_history.jsonl，供 PipelineHistory 组件使用
export function usePipelineHistory(limit = 20): UsePipelineHistoryReturn {
  const [items, setItems] = useState<PipelineHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/pipeline/history?limit=${limit}`);
      const json = await res.json();
      if (json.success && json.data) {
        setItems(json.data.items);
        setTotal(json.data.total);
      } else {
        setError(json.error?.message ?? "Unknown error");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setIsLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { items, total, isLoading, error, refresh };
}
