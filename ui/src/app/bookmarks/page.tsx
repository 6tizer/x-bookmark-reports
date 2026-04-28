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
import type { BookmarkStatus } from "@/types/api";

export default function BookmarksPage() {
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

  const statusOptions: { label: string; value: BookmarkStatus | undefined }[] = [
    { label: "All", value: undefined },
    { label: "Synced", value: "synced" },
    { label: "Read", value: "read" },
    { label: "Reported", value: "reported" },
    { label: "Articled", value: "articled" },
  ];

  return (
    <ClientLayout>
      <div className="space-y-4 max-w-6xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">Bookmarks</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {total} total • Page {page}
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
                placeholder="Search..."
                className="h-8 rounded-md border border-border bg-muted px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring w-40 sm:w-52"
              />
              <button
                onClick={handleSearch}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-muted transition-colors"
              >
                <Search size={14} />
              </button>
            </div>

            {/* Status filter */}
            <select
              value={filters.status || ""}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  status: (e.target.value as BookmarkStatus) || undefined,
                })
              }
              className="h-8 rounded-md border border-border bg-muted px-2 text-sm outline-none"
            >
              {statusOptions.map((opt) => (
                <option key={opt.label} value={opt.value || ""}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* View toggle */}
            <div className="flex items-center rounded-md border border-border overflow-hidden">
              <button
                onClick={() => setViewMode("table")}
                className={`flex h-8 w-8 items-center justify-center transition-colors ${
                  viewMode === "table" ? "bg-muted" : "hover:bg-muted/50"
                }`}
              >
                <Table2 size={14} />
              </button>
              <button
                onClick={() => setViewMode("card")}
                className={`flex h-8 w-8 items-center justify-center transition-colors ${
                  viewMode === "card" ? "bg-muted" : "hover:bg-muted/50"
                }`}
              >
                <LayoutGrid size={14} />
              </button>
            </div>

            <button
              onClick={refresh}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-muted transition-colors"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* Selection bar */}
        {selectedIds.length > 0 && (
          <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
            <span className="text-muted-foreground">{selectedIds.length} selected</span>
            <button
              onClick={async () => {
                for (const id of selectedIds) {
                  await startRead(id, false);
                }
                setSelectedIds([]);
              }}
              className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground"
            >
              Batch Read
            </button>
            <button
              onClick={() => setSelectedIds([])}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
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
            Showing {bookmarks.length} of {total}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50 transition-colors"
            >
              Previous
            </button>
            <span className="px-2 text-xs text-muted-foreground">{page}</span>
            <button
              onClick={() => hasMore && setPage(page + 1)}
              disabled={!hasMore}
              className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </ClientLayout>
  );
}
