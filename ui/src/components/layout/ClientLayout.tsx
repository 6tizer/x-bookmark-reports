"use client";

/**
 * ClientLayout — Wraps all pages with Sidebar, Header, CommandPalette
 */

import { useEffect, useState } from "react";
import { Sidebar, type SidebarCounts } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { HealthBanner } from "@/components/layout/HealthBanner";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { useUIStore } from "@/store/useUIStore";
import { cn } from "@/lib/utils";

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const { sidebarOpen } = useUIStore();
  const [counts, setCounts] = useState<SidebarCounts>({});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/dashboard/stats");
        const json = await res.json();
        if (!cancelled && json.success && json.data) {
          const stats = json.data;
          // Stage 2: bookmarks 徽章用 "total/totalDrafts" 形式；articles 用 totalArticlesLocal
          setCounts({
            bookmarks: `${stats.totalBookmarks}/${stats.totalDrafts}`,
            articles: stats.totalArticlesLocal,
          });
        }
      } catch {
        if (!cancelled) setCounts({});
      }
    };
    load();
    const t = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar counts={counts} />
      <div
        className={cn(
          "flex flex-col min-h-screen transition-all duration-300",
          sidebarOpen ? "ml-60" : "ml-14"
        )}
      >
        <Header />
        <HealthBanner />
        <main className="flex-1 p-4 md:p-6 overflow-auto">{children}</main>
      </div>
      <CommandPalette />
    </div>
  );
}
