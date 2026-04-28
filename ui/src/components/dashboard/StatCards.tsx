"use client";

/**
 * StatCards — 5 stat cards in grid on Dashboard
 */

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
import {
  Clock,
  Bookmark,
  TrendingUp,
  AlertCircle,
  FileText,
} from "lucide-react";
import type { DashboardStats } from "@/types/api";
import { Skeleton } from "@/components/ui/Skeleton";

interface StatCardsProps {
  stats: DashboardStats | null;
  isLoading: boolean;
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

export function StatCards({ stats, isLoading }: StatCardsProps) {
  if (isLoading || !stats) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
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

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      <StatCard
        icon={<Clock size={16} className="text-twitter-blue" />}
        label="Last Sync"
        value={lastSyncText}
        subtext={stats.lastSyncAt ? new Date(stats.lastSyncAt).toLocaleDateString() : undefined}
        trend="neutral"
      />
      <StatCard
        icon={<Bookmark size={16} className="text-green-600" />}
        label="Total Bookmarks"
        value={stats.totalBookmarks}
        trend="up"
      />
      <StatCard
        icon={<TrendingUp size={16} className="text-purple-500" />}
        label="New This Week"
        value={stats.newThisWeek}
        trend="up"
      />
      <StatCard
        icon={<AlertCircle size={16} className="text-orange-500" />}
        label="Pending"
        value={stats.pendingCount}
        trend={stats.pendingCount > 0 ? "down" : "neutral"}
      />
      <StatCard
        icon={<FileText size={16} className="text-blue-500" />}
        label="Reports"
        value={stats.reportCount}
        trend="up"
      />
    </div>
  );
}
