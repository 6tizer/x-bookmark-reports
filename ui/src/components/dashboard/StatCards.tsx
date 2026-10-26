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
// 统一按产品时区（Asia/Singapore）展示日期，不跟浏览器时区
import { formatDate, formatDateTime } from "@/lib/format-date";
import { useT, type TFunction } from "@/lib/i18n";

function formatDistanceToNowSimple(dateStr: string, t: TFunction): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffDay > 7) return formatDate(date);
  if (diffDay > 0) return t("dashboard.time.daysAgo", { n: diffDay });
  if (diffHour > 0) return t("dashboard.time.hoursAgo", { n: diffHour });
  if (diffMin > 0) return t("dashboard.time.minutesAgo", { n: diffMin });
  return t("dashboard.time.justNow");
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
  const t = useT();

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
    ? formatDistanceToNowSimple(stats.lastSyncAt, t)
    : t("dashboard.stat.never");

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
          label={t("dashboard.stat.bookmarks")}
          value={stats.totalBookmarks}
          subtext="bookmarks.json"
          trend="neutral"
        />
        <StatCard
          icon={<FileStack size={16} className="text-green-600" />}
          label={t("dashboard.stat.deepDrafts")}
          value={stats.totalDrafts}
          subtext={t("dashboard.stat.deepDraftsSub", { count: stats.pendingRewriteGlobal })}
          trend="neutral"
        />
        <StatCard
          icon={<PenLine size={16} className="text-blue-500" />}
          label={t("dashboard.stat.articlesLocal")}
          value={stats.totalArticlesLocal}
          subtext="output/article-final/"
          trend="neutral"
        />
        <StatCard
          icon={<CloudUpload size={16} className="text-violet-500" />}
          label={t("dashboard.stat.inNotion")}
          value={stats.totalArticlesNotion}
          // Notion API 总记录含历史；本管线已上传来自 .notion-finished-state
          subtext={t("dashboard.stat.inNotionSub", { count: stats.notionFinishedUploaded })}
          trend="neutral"
        />
        <StatCard
          icon={<AlertCircle size={16} className="text-orange-500" />}
          label={t("dashboard.stat.pendingRewrite")}
          value={stats.pendingRewriteGlobal}
          subtext={t("dashboard.stat.pendingRewriteSub", { count: stats.pendingRewriteLocal })}
          trend={stats.pendingRewriteGlobal > 0 ? "down" : "neutral"}
        />
        <StatCard
          icon={<Clock size={16} className="text-twitter-blue" />}
          label={t("dashboard.stat.lastSync")}
          value={lastSyncText}
          subtext={
            stats.lastSyncAt
              ? formatDateTime(stats.lastSyncAt)
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
                {t("dashboard.rettiwt.updateAvailable")}
              </p>
              <p className="text-xs text-amber-800/90 dark:text-amber-200/90 mt-1">
                {t("dashboard.rettiwt.localCli")}{" "}
                <code className="text-[11px]">{rettiwt!.localVersion}</code> →{" "}
                {t("dashboard.rettiwt.latestNpm")}{" "}
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
          {t("dashboard.rettiwt.checkError", { error: rettiwt.error })}
        </p>
      )}
    </div>
  );
}
