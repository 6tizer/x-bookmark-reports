"use client";

/**
 * SyncHistory — Table of past syncs
 */

import { RefreshCw } from "lucide-react";
import type { SyncJob } from "@/types/api";
import { Skeleton } from "@/components/ui/Skeleton";

interface SyncHistoryProps {
  jobs: SyncJob[];
  isLoading: boolean;
}

export function SyncHistory({ jobs, isLoading }: SyncHistoryProps) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-2.5 w-20" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <RefreshCw size={32} className="mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">No sync history yet</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Job ID</th>
            <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Mode</th>
            <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Status</th>
            <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Progress</th>
            <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">New</th>
            <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Started</th>
            <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Completed</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id} className="border-b border-border hover:bg-muted/50 transition-colors">
              <td className="px-3 py-2.5 font-mono text-xs">{job.id}</td>
              <td className="px-3 py-2.5">
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium capitalize">
                  {job.mode}
                </span>
              </td>
              <td className="px-3 py-2.5">
                <StatusBadge status={job.status} />
              </td>
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        job.status === "completed"
                          ? "bg-green-500"
                          : job.status === "failed"
                          ? "bg-red-500"
                          : "bg-twitter-blue"
                      }`}
                      style={{ width: `${job.progress}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{job.progress}%</span>
                </div>
              </td>
              <td className="px-3 py-2.5 text-muted-foreground">
                {job.newCount} / {job.totalCount}
              </td>
              <td className="px-3 py-2.5 text-[11px] text-muted-foreground">
                {new Date(job.startedAt).toLocaleString()}
              </td>
              <td className="px-3 py-2.5 text-[11px] text-muted-foreground">
                {job.completedAt ? new Date(job.completedAt).toLocaleString() : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: SyncJob["status"] }) {
  const colors: Record<SyncJob["status"], string> = {
    queued: "bg-yellow-50 text-yellow-600 dark:bg-yellow-950 dark:text-yellow-400",
    running: "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
    completed: "bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-400",
    failed: "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400",
  };

  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${colors[status]}`}>
      {status}
    </span>
  );
}
