"use client";

/**
 * Bookmarks list page — Table/Card toggle
 */

import { useState } from "react";
import { ClientLayout } from "@/components/layout/ClientLayout";
import { BookmarkTable } from "@/components/bookmarks/BookmarkTable";
import { BookmarkCard } from "@/components/bookmarks/BookmarkCard";
import { useBookmarks } from "@/hooks/useBookmarks";
import { useBookmarkStore } from "@/store/useBookmarkStore";
import { startRead } from "@/lib/api";
import { LayoutGrid, Table2, Search, RefreshCw } from "lucide-react";
import type { BookmarkLifecycle } from "@/types/api";
import { useT } from "@/lib/i18n";

export default function BookmarksPage() {
  const t = useT();
  const {
    bookmarks,
    isLoading,
    total,
    page,
    hasMore,
    filters,
    setPage,
    setFilters,
    refresh,
    updateTags,
    updateStatus,
  } = useBookmarks();

  const { viewMode, setViewMode } = useBookmarkStore();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchValue, setSearchValue] = useState("");

  const handleToggleSelection = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === bookmarks.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(bookmarks.map((b) => b.id));
    }
  };

  const handleStartRead = async (id: string, enhanced: boolean) => {
    await startRead(id, enhanced);
  };

  const handleSearch = () => {
    setFilters({ ...filters, search: searchValue || undefined });
  };

  // Stage 3: lifecycle 过滤器替代 V1 status 过滤
  const lifecycleOptions: { label: string; value: BookmarkLifecycle | undefined }[] = [
    { label: t("bookmarks.filter.all"), value: undefined },
    { label: t("bookmarks.filter.pending"), value: "pending" },
    { label: t("bookmarks.filter.drafted"), value: "drafted" },
    { label: t("bookmarks.filter.written"), value: "written" },
    { label: t("bookmarks.filter.uploaded"), value: "uploaded" },
  ];

  return (
    <ClientLayout>
      <div className="space-y-4 max-w-6xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">{t("common.nav.bookmarks")}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("bookmarks.list.summary", { total, page })}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder={t("bookmarks.list.searchPlaceholder")}
                aria-label={t("common.action.search")}
                className="h-8 rounded-md border border-border bg-muted px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring w-40 sm:w-52"
              />
              <button
                onClick={handleSearch}
                title={t("common.action.search")}
                aria-label={t("common.action.search")}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-muted transition-colors"
              >
                <Search size={14} />
              </button>
            </div>

            {/* Lifecycle filter（替代 V1 status） */}
            <select
              value={filters.lifecycle || ""}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  lifecycle: (e.target.value as BookmarkLifecycle) || undefined,
                })
              }
              aria-label={t("bookmarks.list.filterLabel")}
              className="h-8 rounded-md border border-border bg-muted px-2 text-sm outline-none"
            >
              {lifecycleOptions.map((opt) => (
                <option key={opt.value ?? "all"} value={opt.value || ""}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* View toggle */}
            <div className="flex items-center rounded-md border border-border overflow-hidden">
              <button
                onClick={() => setViewMode("table")}
                title={t("bookmarks.list.viewTable")}
                aria-label={t("bookmarks.list.viewTable")}
                className={`flex h-8 w-8 items-center justify-center transition-colors ${
                  viewMode === "table" ? "bg-muted" : "hover:bg-muted/50"
                }`}
              >
                <Table2 size={14} />
              </button>
              <button
                onClick={() => setViewMode("card")}
                title={t("bookmarks.list.viewCard")}
                aria-label={t("bookmarks.list.viewCard")}
                className={`flex h-8 w-8 items-center justify-center transition-colors ${
                  viewMode === "card" ? "bg-muted" : "hover:bg-muted/50"
                }`}
              >
                <LayoutGrid size={14} />
              </button>
            </div>

            <button
              onClick={refresh}
              title={t("common.action.refresh")}
              aria-label={t("common.action.refresh")}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-muted transition-colors"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* Selection bar */}
        {selectedIds.length > 0 && (
          <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
            <span className="text-muted-foreground">{t("bookmarks.list.selected", { count: selectedIds.length })}</span>
            <button
              onClick={async () => {
                for (const id of selectedIds) {
                  await startRead(id, false);
                }
                setSelectedIds([]);
              }}
              className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground"
            >
              {t("bookmarks.list.batchRead")}
            </button>
            <button
              onClick={() => setSelectedIds([])}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {t("bookmarks.list.clearSelection")}
            </button>
          </div>
        )}

        {/* Content */}
        {viewMode === "table" ? (
          <BookmarkTable
            bookmarks={bookmarks}
            isLoading={isLoading}
            selectedIds={selectedIds}
            onToggleSelection={handleToggleSelection}
            onSelectAll={handleSelectAll}
            onUpdateStatus={updateStatus}
            onUpdateTags={updateTags}
            onStartRead={handleStartRead}
          />
        ) : (
          <BookmarkCard
            bookmarks={bookmarks}
            isLoading={isLoading}
            onUpdateStatus={updateStatus}
            onUpdateTags={updateTags}
            onStartRead={handleStartRead}
          />
        )}

        {/* Pagination */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {t("bookmarks.list.showing", { count: bookmarks.length, total })}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50 transition-colors"
            >
              {t("bookmarks.list.previous")}
            </button>
            <span className="px-2 text-xs text-muted-foreground">{page}</span>
            <button
              onClick={() => hasMore && setPage(page + 1)}
              disabled={!hasMore}
              className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50 transition-colors"
            >
              {t("bookmarks.list.next")}
            </button>
          </div>
        </div>
      </div>
    </ClientLayout>
  );
}
