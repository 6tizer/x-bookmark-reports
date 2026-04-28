"use client";

/**
 * ActivityFeed — Recent activity list on Dashboard
 */

import {
  RefreshCw,
  BookOpen,
  FileText,
  Newspaper,
  Settings,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react";
import type { ActivityItem, ActivityType, ActivityAction } from "@/types/api";
import { Skeleton } from "@/components/ui/Skeleton";

interface ActivityFeedProps {
  activities: ActivityItem[];
  isLoading: boolean;
}

const typeIcon: Record<ActivityType, React.ReactNode> = {
  sync: <RefreshCw size={14} />,
  read: <BookOpen size={14} />,
  report: <FileText size={14} />,
  article: <Newspaper size={14} />,
  setting: <Settings size={14} />,
};

const actionIcon: Record<ActivityAction, React.ReactNode> = {
  started: <AlertCircle size={12} className="text-yellow-500" />,
  completed: <CheckCircle2 size={12} className="text-green-500" />,
  failed: <XCircle size={12} className="text-red-500" />,
  updated: <CheckCircle2 size={12} className="text-blue-500" />,
};

const typeColor: Record<ActivityType, string> = {
  sync: "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
  read: "bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-400",
  report: "bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-400",
  article: "bg-orange-50 text-orange-600 dark:bg-orange-950 dark:text-orange-400",
  setting: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffDay > 0) return `${diffDay}d ago`;
  if (diffHour > 0) return `${diffHour}h ago`;
  if (diffMin > 0) return `${diffMin}m ago`;
  return "Just now";
}

export function ActivityFeed({ activities, isLoading }: ActivityFeedProps) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <Skeleton className="h-5 w-28 mb-3" />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-2.5 w-20" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">No recent activity</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground mb-3">Recent Activity</h2>
      <ul className="space-y-2">
        {activities.map((activity) => (
          <li
            key={activity.id}
            className="flex items-start gap-3 rounded-md p-2 hover:bg-muted transition-colors"
          >
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${typeColor[activity.type]}`}
            >
              {typeIcon[activity.type]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                {actionIcon[activity.action]}
                <p className="text-sm text-foreground truncate">{activity.message}</p>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {formatTime(activity.timestamp)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
