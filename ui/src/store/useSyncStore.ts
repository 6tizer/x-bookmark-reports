"use client";

/**
 * Sync Store — sync jobs, current job, syncing state
 */

import { create } from "zustand";
import type { SyncJob, SyncMode } from "@/types/api";

interface SyncStore {
  syncJobs: SyncJob[];
  currentJob: SyncJob | null;
  isSyncing: boolean;
  isLoading: boolean;

  setSyncJobs: (jobs: SyncJob[]) => void;
  appendSyncJobs: (jobs: SyncJob[]) => void;
  setCurrentJob: (job: SyncJob | null) => void;
  updateCurrentJob: (patch: Partial<SyncJob>) => void;
  setIsSyncing: (syncing: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  addLogToCurrentJob: (log: string) => void;
  reset: () => void;
}

export const useSyncStore = create<SyncStore>((set) => ({
  syncJobs: [],
  currentJob: null,
  isSyncing: false,
  isLoading: false,

  setSyncJobs: (syncJobs) => set({ syncJobs }),
  appendSyncJobs: (jobs) =>
    set((state) => ({ syncJobs: [...state.syncJobs, ...jobs] })),
  setCurrentJob: (currentJob) => set({ currentJob, isSyncing: currentJob?.status === "running" }),
  updateCurrentJob: (patch) =>
    set((state) => ({
      currentJob: state.currentJob
        ? { ...state.currentJob, ...patch }
        : null,
      isSyncing: patch.status === "running",
    })),
  setIsSyncing: (isSyncing) => set({ isSyncing }),
  setIsLoading: (isLoading) => set({ isLoading }),
  addLogToCurrentJob: (log) =>
    set((state) => ({
      currentJob: state.currentJob
        ? {
            ...state.currentJob,
            logs: [...state.currentJob.logs, log],
          }
        : null,
    })),
  reset: () =>
    set({
      syncJobs: [],
      currentJob: null,
      isSyncing: false,
      isLoading: false,
    }),
}));
