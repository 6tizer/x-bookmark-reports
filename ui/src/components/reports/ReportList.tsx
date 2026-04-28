"use client";

/**
 * ReportList — Report library
 */

import Link from "next/link";
import { FileText, Clock, ExternalLink } from "lucide-react";
import type { Report } from "@/types/api";
import { Skeleton } from "@/components/ui/Skeleton";

interface ReportListProps {
  reports: Report[];
  isLoading: boolean;
}

export function ReportList({ reports, isLoading }: ReportListProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-4 flex items-center gap-4">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <FileText size={32} className="mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">No reports yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {reports.map((report) => (
        <Link
          key={report.id}
          href={`/reports/${report.id}`}
          className="group flex items-center gap-4 rounded-lg border border-border bg-card p-4 hover:shadow-sm hover:border-twitter-blue/30 transition-all"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
            <FileText size={18} className="text-twitter-blue" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-foreground truncate group-hover:text-twitter-blue transition-colors">
                {report.title}
              </h3>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
                  report.type === "enhanced"
                    ? "bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-400"
                    : "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400"
                }`}
              >
                {report.type}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-0.5">
                <Clock size={11} />
                {new Date(report.generatedAt).toLocaleDateString()}
              </span>
              <span>{report.wordCount.toLocaleString()} words</span>
              <span>{report.urlSummary.length} links</span>
            </div>
          </div>
          <ExternalLink size={14} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </Link>
      ))}
    </div>
  );
}
