"use client";

/**
 * BookmarkCard — Card view of bookmarks
 */

import { useState } from "react";
import Link from "next/link";
import {
  Heart,
  MessageCircle,
  Bookmark as BookmarkIcon,
  Eye,
  ExternalLink,
} from "lucide-react";
import type { Bookmark, BookmarkStatus, BookmarkLifecycle } from "@/types/api";
import { Skeleton } from "@/components/ui/Skeleton";
import { BookmarkToolbar } from "./BookmarkToolbar";

interface BookmarkCardProps {
  bookmarks: Bookmark[];
  isLoading: boolean;
  onUpdateStatus: (id: string, status: BookmarkStatus) => void;
  onUpdateTags: (id: string, tags: string[]) => void;
  onStartRead: (id: string, enhanced: boolean) => void;
}

export function BookmarkCard({
  bookmarks,
  isLoading,
  onUpdateStatus,
  onUpdateTags,
  onStartRead,
}: BookmarkCardProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="space-y-1">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-2.5 w-16" />
              </div>
            </div>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        ))}
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

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {bookmarks.map((bookmark) => (
        <div
          key={bookmark.id}
          className="group relative rounded-lg border border-border bg-card p-4 hover:shadow-md transition-all"
          onMouseEnter={() => setHoveredId(bookmark.id)}
          onMouseLeave={() => setHoveredId(null)}
        >
          {/* Author */}
          <div className="flex items-center gap-2.5">
            {bookmark.author.avatar ? (
              <img
                src={bookmark.author.avatar}
                alt={bookmark.author.name}
                className="h-9 w-9 rounded-full object-cover"
              />
            ) : (
              <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                {bookmark.author.name[0]}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{bookmark.author.name}</p>
              <p className="text-[11px] text-muted-foreground">{bookmark.author.handle}</p>
            </div>
            <LifecycleBadge lifecycle={bookmark.lifecycle} status={bookmark.status} />
          </div>

          {/* Tweet text */}
          <Link href={`/bookmarks/${bookmark.tweetId ?? bookmark.id}`}>
            <p className="mt-3 text-sm text-foreground line-clamp-3 leading-relaxed hover:text-twitter-blue transition-colors">
              {bookmark.text}
            </p>
          </Link>

          {/* Stats */}
          <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-0.5"><Heart size={12} /> {bookmark.stats.likes}</span>
            <span className="flex items-center gap-0.5"><MessageCircle size={12} /> {bookmark.stats.replies}</span>
            <span className="flex items-center gap-0.5"><BookmarkIcon size={12} /> {bookmark.stats.bookmarks}</span>
            <span className="flex items-center gap-0.5"><Eye size={12} /> {bookmark.stats.views}</span>
          </div>

          {/* Tags */}
          {(bookmark.articleTags ?? bookmark.tags).length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1">
              {(bookmark.articleTags ?? bookmark.tags).map((tag) => (
                <span
                  key={tag}
                  className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Date */}
          <p className="mt-2 text-[10px] text-muted-foreground">
            {new Date(bookmark.bookmarkedAt).toLocaleDateString()}
          </p>

          {/* Floating toolbar */}
          {hoveredId === bookmark.id && (
            <div className="absolute bottom-2 right-2 z-10">
              <BookmarkToolbar
                bookmarkId={bookmark.id}
                status={bookmark.status}
                onRead={() => onStartRead(bookmark.id, false)}
                onEnhancedRead={() => onStartRead(bookmark.id, true)}
                onUpdateStatus={onUpdateStatus}
                onUpdateTags={onUpdateTags}
              />
            </div>
          )}

          {/* External link */}
          <a
            href={bookmark.url}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute top-3 right-3 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ExternalLink size={14} />
          </a>
        </div>
      ))}
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
