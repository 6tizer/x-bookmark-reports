"use client";

/**
 * Bookmark Store — bookmarks list, selection, view mode
 */

import { create } from "zustand";
import type { Bookmark, ViewMode, BookmarkListQuery } from "@/types/api";

interface BookmarkStore {
  bookmarks: Bookmark[];
  selectedBookmark: Bookmark | null;
  viewMode: ViewMode;
  isLoading: boolean;
  total: number;
  page: number;
  hasMore: boolean;
  filters: BookmarkListQuery;

  setBookmarks: (bookmarks: Bookmark[]) => void;
  appendBookmarks: (bookmarks: Bookmark[]) => void;
  setTotal: (total: number) => void;
  setPage: (page: number) => void;
  setHasMore: (hasMore: boolean) => void;
  selectBookmark: (bookmark: Bookmark | null) => void;
  setViewMode: (mode: ViewMode) => void;
  setIsLoading: (loading: boolean) => void;
  setFilters: (filters: BookmarkListQuery) => void;
  updateBookmarkInPlace: (id: string, patch: Partial<Bookmark>) => void;
}

export const useBookmarkStore = create<BookmarkStore>((set) => ({
  bookmarks: [],
  selectedBookmark: null,
  viewMode: "table",
  isLoading: false,
  total: 0,
  page: 1,
  hasMore: false,
  filters: {},

  setBookmarks: (bookmarks) => set({ bookmarks }),
  appendBookmarks: (bookmarks) =>
    set((state) => ({ bookmarks: [...state.bookmarks, ...bookmarks] })),
  setTotal: (total) => set({ total }),
  setPage: (page) => set({ page }),
  setHasMore: (hasMore) => set({ hasMore }),
  selectBookmark: (bookmark) => set({ selectedBookmark: bookmark }),
  setViewMode: (viewMode) => set({ viewMode }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setFilters: (filters) => set({ filters }),

  updateBookmarkInPlace: (id, patch) =>
    set((state) => ({
      bookmarks: state.bookmarks.map((b) =>
        b.id === id ? { ...b, ...patch } : b
      ),
      selectedBookmark:
        state.selectedBookmark?.id === id
          ? { ...state.selectedBookmark, ...patch }
          : state.selectedBookmark,
    })),
}));
