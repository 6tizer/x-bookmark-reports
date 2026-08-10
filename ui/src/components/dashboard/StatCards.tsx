"use client";

/**
 * StatCards — 6 cards: Bookmarks, Deep Drafts, Articles (Local), In Notion DB,
 * Pending Rewrite, Last Sync
 */

import {
  Clock,
  Bookmark,
  FileStack,
  CloudUpload,
  AlertCircle,
  Terminal,
  PenLine,
} from "lucide-react";
import type { DashboardStats, RettiwtStatus } from "@/types/api";
import { Skeleton } from "@/components/ui/Skeleton";

function formatDistanceToNowSimple(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffDay > 7) return date.toLocaleDateString();
  if (diffDay > 0) return `${diffDay}d ago`;
  if (diffHour > 0) return `${diffHour}h ago`;
  if (diffMin > 0) return `${diffMin}m ago`;
  return "Just now";
}

interface StatCardsProps {
  stats: DashboardStats | null;
  isLoading: boolean;
  rettiwt?: RettiwtStatus | null;
}

function StatCard({
  icon,
  label,
  value,
  subtext,
  trend,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtext?: string;
  trend?: "up" | "down" | "neutral";
}) {
  const trendColor =
    trend === "up"
      ? "text-green-600"
      : trend === "down"
        ? "text-red-500"
        : "text-muted-foreground";

  return (
    <div className="rounded-lg border border-border bg-card p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
          {icon}
        </div>
        {trend && (
          <span className={`text-xs font-medium ${trendColor}`}>
            {trend === "up" ? "↑" : trend === "down" ? "↓" : "—"}
          </span>
        )}
      </div>
      <div className="mt-3">
        <p className="text-2xl font-semibold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </div>
      {subtext && (
        <p className="mt-2 text-[11px] text-muted-foreground">{subtext}</p>
      )}
    </div>
  );
}

export function StatCards({ stats, isLoading, rettiwt }: StatCardsProps) {
  if (isLoading || !stats) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-border bg-card p-4"
          >
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="mt-3 h-7 w-16" />
            <Skeleton className="mt-1 h-3 w-24" />
          </div>
        ))}
      </div>
    );
  }

  const lastSyncText = stats.lastSyncAt
    ? formatDistanceToNowSimple(stats.lastSyncAt)
    : "Never";

  const showRettiwtAlert =
    rettiwt?.updateAvailable &&
    !rettiwt.error &&
    rettiwt.latestVersion &&
    rettiwt.localVersion;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard
          icon={<Bookmark size={16} className="text-twitter-blue" />}
          label="Bookmarks"
          value={stats.totalBookmarks}
          subtext="bookmarks.json"
          trend="neutral"
        />
        <StatCard
          icon={<FileStack size={16} className="text-green-600" />}
          label="Deep Drafts"
          value={stats.totalDrafts}
          subtext={`${stats.pendingRewriteGlobal} pending`}
          trend="neutral"
        />
        <StatCard
          icon={<PenLine size={16} className="text-blue-500" />}
          label="Articles (Local)"
          value={stats.totalArticlesLocal}
          subtext="output/article-final/"
          trend="neutral"
        />
        <StatCard
          icon={<CloudUpload size={16} className="text-violet-500" />}
          label="In Notion DB"
          value={stats.totalArticlesNotion}
          // Notion API 总记录含历史；本管线已上传来自 .notion-finished-state
          subtext={`Notion 总记录（含历史）· 本管线已上传 ${stats.notionFinishedUploaded}`}
          trend="neutral"
        />
        <StatCard
          icon={<AlertCircle size={16} className="text-orange-500" />}
          label="Pending Rewrite"
          value={stats.pendingRewriteGlobal}
          subtext={`Local: ${stats.pendingRewriteLocal}`}
          trend={stats.pendingRewriteGlobal > 0 ? "down" : "neutral"}
        />
        <StatCard
          icon={<Clock size={16} className="text-twitter-blue" />}
          label="Last Sync"
          value={lastSyncText}
          subtext={
            stats.lastSyncAt
              ? new Date(stats.lastSyncAt).toLocaleString()
              : undefined
          }
          trend="neutral"
        />
      </div>

      {showRettiwtAlert && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 px-4 py-3 text-sm">
          <div className="flex items-start gap-2">
            <Terminal
              size={16}
              className="text-amber-700 dark:text-amber-400 shrink-0 mt-0.5"
            />
            <div className="min-w-0">
              <p className="font-medium text-amber-900 dark:text-amber-100">
                Rettiwt update available
              </p>
              <p className="text-xs text-amber-800/90 dark:text-amber-200/90 mt-1">
                Local CLI <code className="text-[11px]">{rettiwt!.localVersion}</code> →
                latest npm{" "}
                <code className="text-[11px]">{rettiwt!.latestVersion}</code>
              </p>
              <p className="text-[11px] text-amber-900/80 dark:text-amber-200/80 mt-2 font-mono break-all">
                npm install -g rettiwt-api
              </p>
            </div>
          </div>
        </div>
      )}

      {rettiwt?.error && (
        <p className="text-[11px] text-muted-foreground">
          Rettiwt check: {rettiwt.error}
        </p>
      )}
    </div>
  );
}
