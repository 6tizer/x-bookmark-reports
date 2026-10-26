"use client";

/**
 * BookmarkToolbar — Floating toolbar on bookmark hover
 */

import { useState } from "react";
import { BookOpen, Sparkles, Tag, MoreHorizontal, Trash2 } from "lucide-react";
import type { BookmarkStatus } from "@/types/api";
import { useT } from "@/lib/i18n";

interface BookmarkToolbarProps {
  bookmarkId: string;
  status: BookmarkStatus;
  onRead: () => void;
  onEnhancedRead: () => void;
  onUpdateStatus: (id: string, status: BookmarkStatus) => void;
  onUpdateTags: (id: string, tags: string[]) => void;
}

export function BookmarkToolbar({
  bookmarkId,
  status,
  onRead,
  onEnhancedRead,
  onUpdateStatus,
  onUpdateTags,
}: BookmarkToolbarProps) {
  const t = useT();
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagValue, setTagValue] = useState("");

  const handleTagSubmit = () => {
    if (tagValue.trim()) {
      onUpdateTags(bookmarkId, tagValue.split(",").map((tag) => tag.trim()));
      setTagValue("");
      setShowTagInput(false);
    }
  };

  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border bg-background shadow-lg p-0.5">
      <button
        onClick={onRead}
        className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        title={t("bookmarks.toolbar.read")}
        aria-label={t("bookmarks.toolbar.read")}
      >
        <BookOpen size={14} />
      </button>
      <button
        onClick={onEnhancedRead}
        className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        title={t("bookmarks.toolbar.enhancedRead")}
        aria-label={t("bookmarks.toolbar.enhancedRead")}
      >
        <Sparkles size={14} />
      </button>
      <div className="relative">
        <button
          onClick={() => setShowTagInput(!showTagInput)}
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title={t("bookmarks.toolbar.tags")}
          aria-label={t("bookmarks.toolbar.tags")}
        >
          <Tag size={14} />
        </button>
        {showTagInput && (
          <div className="absolute right-0 top-8 z-20 w-48 rounded-md border border-border bg-background shadow-lg p-2">
            <input
              value={tagValue}
              onChange={(e) => setTagValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleTagSubmit()}
              placeholder={t("bookmarks.toolbar.tagPlaceholder")}
              className="w-full rounded border border-border bg-muted px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
              autoFocus
            />
            <div className="mt-1 flex gap-1">
              <button
                onClick={handleTagSubmit}
                className="rounded bg-primary px-2 py-0.5 text-[10px] text-primary-foreground"
              >
                {t("common.action.save")}
              </button>
              <button
                onClick={() => setShowTagInput(false)}
                className="rounded border border-border px-2 py-0.5 text-[10px]"
              >
                {t("common.action.cancel")}
              </button>
            </div>
          </div>
        )}
      </div>
      <button
        onClick={() => {
          const next: BookmarkStatus =
            status === "synced"
              ? "read"
              : status === "read"
              ? "reported"
              : status === "reported"
              ? "articled"
              : "synced";
          onUpdateStatus(bookmarkId, next);
        }}
        className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        title={t("bookmarks.toolbar.toggleStatus")}
        aria-label={t("bookmarks.toolbar.toggleStatus")}
      >
        <MoreHorizontal size={14} />
      </button>
      <button
        onClick={() => {}}
        className="flex h-7 w-7 items-center justify-center rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors"
        title={t("common.action.delete")}
        aria-label={t("common.action.delete")}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
