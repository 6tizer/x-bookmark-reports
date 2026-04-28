"use client";

/**
 * Reports page — Report library
 */

import { useState } from "react";
import { ClientLayout } from "@/components/layout/ClientLayout";
import { ReportList } from "@/components/reports/ReportList";
import { useReports } from "@/hooks/useReports";
import { Search, RefreshCw, Filter } from "lucide-react";
import type { ReportType } from "@/types/api";

export default function ReportsPage() {
  const { reports, isLoading, fetchReports } = useReports();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<ReportType | undefined>(undefined);

  const handleSearch = () => {
    fetchReports({ search: search || undefined, type: typeFilter });
  };

  return (
    <ClientLayout>
      <div className="space-y-4 max-w-5xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">Reports</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{reports.length} reports</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Search reports..."
                className="h-8 rounded-md border border-border bg-muted px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring w-44"
              />
              <button
                onClick={handleSearch}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-muted transition-colors"
              >
                <Search size={14} />
              </button>
            </div>

            <select
              value={typeFilter || ""}
              onChange={(e) => {
                const val = e.target.value as ReportType | "";
                setTypeFilter(val || undefined);
              }}
              className="h-8 rounded-md border border-border bg-muted px-2 text-sm outline-none"
            >
              <option value="">All Types</option>
              <option value="basic">Basic</option>
              <option value="enhanced">Enhanced</option>
            </select>

            <button
              onClick={() => fetchReports()}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-muted transition-colors"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        <ReportList reports={reports} isLoading={isLoading} />
      </div>
    </ClientLayout>
  );
}
