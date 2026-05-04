"use client";

/**
 * Dashboard page — StatCards + Pipeline + ActivityFeed
 */

import { useCallback, useEffect, useState } from "react";
import { ClientLayout } from "@/components/layout/ClientLayout";
import { StatCards } from "@/components/dashboard/StatCards";
import { Pipeline } from "@/components/dashboard/Pipeline";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import {
  getDashboardStats,
  getDashboardActivity,
  getRettiwtStatus,
  getBatchProgress as fetchBatchProgress,
} from "@/lib/api";
import type { BatchProgress, DashboardStats, ActivityItem, RettiwtStatus } from "@/types/api";

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [rettiwtStatus, setRettiwtStatus] = useState<RettiwtStatus | null>(null);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadProgress = useCallback(async () => {
    try {
      const p = await fetchBatchProgress();
      setBatchProgress(p);
    } catch {
      setBatchProgress(null);
    }
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [statsData, activityData, rw] = await Promise.all([
          getDashboardStats(),
          getDashboardActivity(10),
          getRettiwtStatus().catch(() => null),
        ]);
        setStats(statsData);
        setActivities(activityData.items);
        if (rw) setRettiwtStatus(rw);
        await loadProgress();
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [loadProgress]);

  useEffect(() => {
    if (!batchProgress?.isRunning) return;
    const t = setInterval(() => {
      void loadProgress();
    }, 5000);
    return () => clearInterval(t);
  }, [batchProgress?.isRunning, loadProgress]);

  return (
    <ClientLayout>
      <div className="space-y-6 max-w-6xl">
        <h1 className="text-xl font-bold text-foreground">Dashboard</h1>

        <StatCards stats={stats} isLoading={isLoading} rettiwt={rettiwtStatus} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Pipeline
              pipeline={stats?.pipeline || null}
              batchProgress={batchProgress}
              isLoading={isLoading}
              onRefreshProgress={loadProgress}
            />
          </div>
          <div>
            <ActivityFeed activities={activities} isLoading={isLoading} />
          </div>
        </div>
      </div>
    </ClientLayout>
  );
}
