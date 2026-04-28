"use client";

/**
 * useLogs — Log streaming
 */

import { useCallback, useEffect, useState } from "react";
import { getLogs } from "@/lib/api";
import type { LogEntry, LogQuery, PaginatedResponse, LogLevel, LogComponent } from "@/types/api";

interface UseLogsReturn {
  logs: LogEntry[];
  isLoading: boolean;
  total: number;
  page: number;
  hasMore: boolean;
  component: LogComponent | undefined;
  level: LogLevel | undefined;

  setComponent: (c: LogComponent | undefined) => void;
  setLevel: (l: LogLevel | undefined) => void;
  setPage: (page: number) => void;
  refresh: () => Promise<void>;
}

export function useLogs(): UseLogsReturn {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPageState] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [component, setComponentState] = useState<LogComponent | undefined>(undefined);
  const [level, setLevelState] = useState<LogLevel | undefined>(undefined);

  const fetchData = useCallback(
    async (p: number, c?: LogComponent, l?: LogLevel) => {
      setIsLoading(true);
      try {
        const query: LogQuery = { page: p, limit: 50 };
        if (c) query.component = c;
        if (l) query.level = l;
        const res: PaginatedResponse<LogEntry> = await getLogs(query);
        if (p === 1) {
          setLogs(res.items);
        } else {
          setLogs((prev) => [...prev, ...res.items]);
        }
        setTotal(res.total);
        setHasMore(res.hasMore);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchData(1, component, level);
  }, [component, level]);

  const setPage = useCallback(
    (p: number) => {
      setPageState(p);
      fetchData(p, component, level);
    },
    [component, level, fetchData]
  );

  const setComponent = useCallback(
    (c: LogComponent | undefined) => {
      setComponentState(c);
      setPageState(1);
    },
    []
  );

  const setLevel = useCallback(
    (l: LogLevel | undefined) => {
      setLevelState(l);
      setPageState(1);
    },
    []
  );

  const refresh = useCallback(async () => {
    setPageState(1);
    await fetchData(1, component, level);
  }, [component, level, fetchData]);

  return {
    logs,
    isLoading,
    total,
    page,
    hasMore,
    component,
    level,
    setComponent,
    setLevel,
    setPage,
    refresh,
  };
}
