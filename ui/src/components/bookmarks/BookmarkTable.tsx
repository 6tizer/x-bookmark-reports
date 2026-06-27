"use client";

/**
 * BookmarkTable — Table view of bookmarks
 */

import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpDown,
  Heart,
  MessageCircle,
  Bookmark as BookmarkIcon,
  Eye,
  CheckSquare,
  Square,
} from "lucide-react";
import type { Bookmark, BookmarkStatus, BookmarkLifecycle } from "@/types/api";
import { Skeleton } from "@/components/ui/Skeleton";
import { BookmarkToolbar } from "./BookmarkToolbar";

interface BookmarkTableProps {
  bookmarks: Bookmark[];
  isLoading: boolean;
  selectedIds: string[];
  onToggleSelection: (id: string) => void;
  onSelectAll: () => void;
  onUpdateStatus: (id: string, status: BookmarkStatus) => void;
  onUpdateTags: (id: string, tags: string[]) => void;
  onStartRead: (id: string, enhanced: boolean) => void;
}

type SortField = "bookmarkedAt" | "likes" | "replies" | "bookmarks" | "views";

export function BookmarkTable({
  bookmarks,
  isLoading,
  selectedIds,
  onToggleSelection,
  onSelectAll,
  onUpdateStatus,
  onUpdateTags,
  onStartRead,
}: BookmarkTableProps) {
  const [sortField, setSortField] = useState<SortField>("bookmarkedAt");
  const [sortDesc, setSortDesc] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDesc(!sortDesc);
    } else {
      setSortField(field);
      setSortDesc(true);
    }
  };

  const sorted = [...bookmarks].sort((a, b) => {
    let cmp = 0;
    switch (sortField) {
      case "bookmarkedAt":
        cmp = new Date(a.bookmarkedAt).getTime() - new Date(b.bookmarkedAt).getTime();
        break;
      case "likes":
        cmp = a.stats.likes - b.stats.likes;
        break;
      case "replies":
        cmp = a.stats.replies - b.stats.replies;
        break;
      case "bookmarks":
        cmp = a.stats.bookmarks - b.stats.bookmarks;
        break;
      case "views":
        cmp = a.stats.views - b.stats.views;
        break;
    }
    return sortDesc ? -cmp : cmp;
  });

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <div className="p-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (bookmarks.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <BookmarkIcon size={32} className="mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">No bookmarks found</p>
      </div>
    );
  }

  const allSelected = bookmarks.length > 0 && selectedIds.length === bookmarks.length;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="px-3 py-2.5 w-8">
              <button onClick={onSelectAll} className="text-muted-foreground hover:text-foreground">
                {allSelected ? <CheckSquare size={16} /> : <Square size={16} />}
              </button>
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Author</th>
            <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Tweet</th>
            <th
              className="px-3 py-2.5 text-left font-medium text-muted-foreground cursor-pointer hover:text-foreground"
              onClick={() => handleSort("bookmarkedAt")}
            >
              <span className="flex items-center gap-1">
                Bookmarked <ArrowUpDown size={12} />
              </span>
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Stats</th>
            <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Tags</th>
            <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Lifecycle</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((bookmark) => {
            const isSelected = selectedIds.includes(bookmark.id);
            return (
              <tr
                key={bookmark.id}
                className="border-b border-border hover:bg-muted/50 transition-colors relative"
                onMouseEnter={() => setHoveredId(bookmark.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <td className="px-3 py-3">
                  <button
                    onClick={() => onToggleSelection(bookmark.id)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                  </button>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    {bookmark.author.avatar ? (
                      <img
                        src={bookmark.author.avatar}
                        alt={bookmark.author.name}
                        className="h-7 w-7 rounded-full object-cover"
                      />
                    ) : (
                      <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                        {bookmark.author.name[0]}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-medium truncate">{bookmark.author.name}</p>
                      <p className="text-[11px] text-muted-foreground">{bookmark.author.handle}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 max-w-xs">
                  <Link
                    href={`/bookmarks/${bookmark.tweetId ?? bookmark.id}`}
                    className="text-foreground hover:text-twitter-blue transition-colors line-clamp-2"
                  >
                    {bookmark.text}
                  </Link>
                </td>
                <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                  {new Date(bookmark.bookmarkedAt).toLocaleDateString()}
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-0.5"><Heart size={12} /> {bookmark.stats.likes}</span>
                    <span className="flex items-center gap-0.5"><MessageCircle size={12} /> {bookmark.stats.replies}</span>
                    <span className="flex items-center gap-0.5"><BookmarkIcon size={12} /> {bookmark.stats.bookmarks}</span>
                    <span className="flex items-center gap-0.5"><Eye size={12} /> {bookmark.stats.views}</span>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-1">
                    {(bookmark.articleTags ?? bookmark.tags).slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                    {(bookmark.articleTags ?? bookmark.tags).length > 3 && (
                      <span className="text-[10px] text-muted-foreground">
                        +{(bookmark.articleTags ?? bookmark.tags).length - 3}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <LifecycleBadge lifecycle={bookmark.lifecycle} status={bookmark.status} />
                </td>

                {/* Floating toolbar on hover */}
                {hoveredId === bookmark.id && (
                  <td className="absolute right-2 top-1/2 -translate-y-1/2 z-10">
                    <BookmarkToolbar
                      bookmarkId={bookmark.id}
                      status={bookmark.status}
                      onRead={() => onStartRead(bookmark.id, false)}
                      onEnhancedRead={() => onStartRead(bookmark.id, true)}
                      onUpdateStatus={onUpdateStatus}
                      onUpdateTags={onUpdateTags}
                    />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: BookmarkStatus }) {
  const colors: Record<BookmarkStatus, string> = {
    synced: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    read: "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
    reported: "bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-400",
    articled: "bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-400",
  };

  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${colors[status]}`}>
      {status}
    </span>
  );
}

// V2 lifecycle badge — lifecycle 缺失时 fallback 到 V1 StatusBadge
function LifecycleBadge({
  lifecycle,
  status,
}: {
  lifecycle?: BookmarkLifecycle;
  status: BookmarkStatus;
}) {
  if (!lifecycle) {
    return <StatusBadge status={status} />;
  }
  const colors: Record<BookmarkLifecycle, string> = {
    pending: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    drafted: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    written: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    uploaded: "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  };
  const labels: Record<BookmarkLifecycle, string> = {
    pending: "待生成",
    drafted: "已报告",
    written: "已成文",
    uploaded: "已 Notion",
  };
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${colors[lifecycle]}`}
    >
      {labels[lifecycle]}
    </span>
  );
}
