"use client";

/**
 * useReports — Report fetching
 */

import { useCallback, useEffect, useState } from "react";
import { useReportStore } from "@/store/useReportStore";
import { getReports, getReportByIdAPI, saveReport, getReportVersions, ApiError } from "@/lib/api";
import type { ReportListQuery, Report, PaginatedResponse, UpdateReportRequest } from "@/types/api";

interface UseReportsReturn {
  reports: Report[];
  selectedReport: Report | null;
  isLoading: boolean;
  isEditing: boolean;
  editContent: string;
  versions: import("@/types/api").ReportVersion[];

  setEditContent: (content: string) => void;
  fetchReports: (query?: ReportListQuery) => Promise<void>;
  selectReport: (id: string) => Promise<void>;
  saveSelectedReport: () => Promise<void>;
  fetchVersions: (id: string) => Promise<void>;
  reportError: string | null;
  clearReportError: () => void;
}

export function useReports(): UseReportsReturn {
  const store = useReportStore();
  const [reportError, setReportError] = useState<string | null>(null);

  const fetchReports = useCallback(
    async (query?: ReportListQuery) => {
      store.setIsLoading(true);
      try {
        const res: PaginatedResponse<Report> = await getReports(query);
        store.setReports(res.items);
      } finally {
        store.setIsLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const selectReport = useCallback(
    async (id: string) => {
      setReportError(null);
      store.setIsLoading(true);
      try {
        const report = await getReportByIdAPI(id);
        store.selectReport(report);
      } catch (e) {
        store.selectReport(null);
        const msg =
          e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Cannot load report";
        setReportError(msg);
      } finally {
        store.setIsLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store]
  );

  const saveSelectedReport = useCallback(async () => {
    if (!store.selectedReport) return;
    store.setIsLoading(true);
    try {
      await saveReport(store.selectedReport.id, {
        content: store.editContent,
        saveMode: "overwrite",
      } as UpdateReportRequest);
      store.updateReportInPlace(store.selectedReport.id, {
        content: store.editContent,
      });
      store.setIsEditing(false);
    } finally {
      store.setIsLoading(false);
    }
  }, [store]);

  const fetchVersions = useCallback(
    async (id: string) => {
      try {
        const versions = await getReportVersions(id);
        store.setVersions(versions);
      } catch {
        store.setVersions([]);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store]
  );

  const clearReportError = useCallback(() => setReportError(null), []);

  return {
    reports: store.reports,
    selectedReport: store.selectedReport,
    isLoading: store.isLoading,
    isEditing: store.isEditing,
    editContent: store.editContent,
    versions: store.versions,
    setEditContent: store.setEditContent,
    fetchReports,
    selectReport,
    saveSelectedReport,
    fetchVersions,
    reportError,
    clearReportError,
  };
}
