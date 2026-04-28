"use client";

/**
 * Report Store — reports list, selection, editing state
 */

import { create } from "zustand";
import type { Report, ReportVersion } from "@/types/api";

interface ReportStore {
  reports: Report[];
  selectedReport: Report | null;
  isEditing: boolean;
  isLoading: boolean;
  versions: ReportVersion[];
  editContent: string;

  setReports: (reports: Report[]) => void;
  selectReport: (report: Report | null) => void;
  setIsEditing: (editing: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  setVersions: (versions: ReportVersion[]) => void;
  setEditContent: (content: string) => void;
  updateReportInPlace: (id: string, patch: Partial<Report>) => void;
}

export const useReportStore = create<ReportStore>((set) => ({
  reports: [],
  selectedReport: null,
  isEditing: false,
  isLoading: false,
  versions: [],
  editContent: "",

  setReports: (reports) => set({ reports }),
  selectReport: (selectedReport) =>
    set({
      selectedReport,
      editContent: selectedReport?.content || "",
      isEditing: false,
    }),
  setIsEditing: (isEditing) => set({ isEditing }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setVersions: (versions) => set({ versions }),
  setEditContent: (editContent) => set({ editContent }),
  updateReportInPlace: (id, patch) =>
    set((state) => ({
      reports: state.reports.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      selectedReport:
        state.selectedReport?.id === id
          ? { ...state.selectedReport, ...patch }
          : state.selectedReport,
    })),
}));
