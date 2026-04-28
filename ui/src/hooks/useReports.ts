"use client";

/**
 * useReports — Report fetching
 */

import { useCallback, useEffect } from "react";
import { useReportStore } from "@/store/useReportStore";
import { getReports, getReportByIdAPI, saveReport, getReportVersions } from "@/lib/api";
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
}

export function useReports(): UseReportsReturn {
  const store = useReportStore();

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
      store.setIsLoading(true);
      try {
        const report = await getReportByIdAPI(id);
        store.selectReport(report);
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
      const versions = await getReportVersions(id);
      store.setVersions(versions);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store]
  );

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
  };
}
