"use client";

/**
 * UI State Store — sidebar, theme, command palette
 */

import { create } from "zustand";
import type { Theme } from "@/types/api";

interface UIStore {
  sidebarOpen: boolean;
  theme: Theme;
  commandPaletteOpen: boolean;

  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setTheme: (theme: Theme) => void;
  toggleCommandPalette: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarOpen: true,
  theme: "system",
  commandPaletteOpen: false,

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open: boolean) => set({ sidebarOpen: open }),

  setTheme: (theme: Theme) => set({ theme }),

  toggleCommandPalette: () =>
    set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),
  setCommandPaletteOpen: (open: boolean) => set({ commandPaletteOpen: open }),
}));
