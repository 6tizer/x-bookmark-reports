"use client";

/**
 * useBookmarks — Bookmark list fetching, pagination, filters
 */

import { useEffect, useCallback } from "react";
import { useBookmarkStore } from "@/store/useBookmarkStore";
import { getBookmarks, updateBookmarkTags, updateBookmarkStatus } from "@/lib/api";
import type { BookmarkListQuery, Bookmark, PaginatedResponse } from "@/types/api";

interface UseBookmarksReturn {
  bookmarks: Bookmark[];
  isLoading: boolean;
  total: number;
  page: number;
  hasMore: boolean;
  filters: BookmarkListQuery;
  setPage: (page: number) => void;
  setFilters: (filters: BookmarkListQuery) => void;
  refresh: () => Promise<void>;
  updateTags: (id: string, tags: string[]) => Promise<void>;
  updateStatus: (id: string, status: Bookmark["status"]) => Promise<void>;
}

export function useBookmarks(): UseBookmarksReturn {
  const store = useBookmarkStore();

  const fetchData = useCallback(
    async (query: BookmarkListQuery) => {
      store.setIsLoading(true);
      try {
        const res: PaginatedResponse<Bookmark> = await getBookmarks(query);
        store.setBookmarks(res.items);
        store.setTotal(res.total);
        store.setPage(res.page);
        store.setHasMore(res.hasMore);
      } finally {
        store.setIsLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    fetchData(store.filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setPage = useCallback(
    (page: number) => {
      const newFilters = { ...store.filters, page };
      store.setFilters(newFilters);
      fetchData(newFilters);
    },
    [store, fetchData]
  );

  const setFilters = useCallback(
    (filters: BookmarkListQuery) => {
      const newFilters = { ...filters, page: 1 };
      store.setFilters(newFilters);
      fetchData(newFilters);
    },
    [store, fetchData]
  );

  const refresh = useCallback(async () => {
    await fetchData(store.filters);
  }, [store.filters, fetchData]);

  const updateTags = useCallback(
    async (id: string, tags: string[]) => {
      await updateBookmarkTags(id, tags);
      store.updateBookmarkInPlace(id, { tags });
    },
    [store]
  );

  const updateStatus = useCallback(
    async (id: string, status: Bookmark["status"]) => {
      await updateBookmarkStatus(id, status);
      store.updateBookmarkInPlace(id, { status });
    },
    [store]
  );

  return {
    bookmarks: store.bookmarks,
    isLoading: store.isLoading,
    total: store.total,
    page: store.page,
    hasMore: store.hasMore,
    filters: store.filters,
    setPage,
    setFilters,
    refresh,
    updateTags,
    updateStatus,
  };
}
