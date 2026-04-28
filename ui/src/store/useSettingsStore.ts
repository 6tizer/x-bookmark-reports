"use client";

/**
 * Settings Store — app settings
 */

import { create } from "zustand";
import type { Settings } from "@/types/api";

interface SettingsStore {
  settings: Settings | null;
  isLoading: boolean;
  isSaving: boolean;

  setSettings: (settings: Settings) => void;
  updateSettingsInPlace: (patch: Partial<Settings>) => void;
  setIsLoading: (loading: boolean) => void;
  setIsSaving: (saving: boolean) => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: null,
  isLoading: false,
  isSaving: false,

  setSettings: (settings) => set({ settings }),
  updateSettingsInPlace: (patch) =>
    set((state) => ({
      settings: state.settings ? { ...state.settings, ...patch } : null,
    })),
  setIsLoading: (isLoading) => set({ isLoading }),
  setIsSaving: (isSaving) => set({ isSaving }),
}));
