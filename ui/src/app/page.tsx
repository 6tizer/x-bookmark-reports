"use client";

/**
 * Dashboard page — StatCards + Pipeline + ActivityFeed
 */

import { useEffect, useState } from "react";
import { ClientLayout } from "@/components/layout/ClientLayout";
import { StatCards } from "@/components/dashboard/StatCards";
import { Pipeline } from "@/components/dashboard/Pipeline";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { getDashboardStats, getDashboardActivity } from "@/lib/api";
import type { DashboardStats, ActivityItem } from "@/types/api";

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [statsData, activityData] = await Promise.all([
          getDashboardStats(),
          getDashboardActivity(10),
        ]);
        setStats(statsData);
        setActivities(activityData.items);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  return (
    <ClientLayout>
      <div className="space-y-6 max-w-6xl">
        <h1 className="text-xl font-bold text-foreground">Dashboard</h1>

        <StatCards stats={stats} isLoading={isLoading} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Pipeline pipeline={stats?.pipeline || null} isLoading={isLoading} />
          </div>
          <div>
            <ActivityFeed activities={activities} isLoading={isLoading} />
          </div>
        </div>
      </div>
    </ClientLayout>
  );
}
