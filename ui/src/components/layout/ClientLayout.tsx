"use client";

/**
 * ClientLayout — Wraps all pages with Sidebar, Header, CommandPalette
 */

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { useUIStore } from "@/store/useUIStore";
import { cn } from "@/lib/utils";

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const { sidebarOpen } = useUIStore();
  const [counts, setCounts] = useState<{ bookmarks?: number; articles?: number }>({});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/dashboard/stats");
        const json = await res.json();
        if (!cancelled && json.success && json.data) {
          setCounts({
            bookmarks: json.data.totalBookmarks,
            articles: json.data.articlesWritten,
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
        <main className="flex-1 p-4 md:p-6 overflow-auto">{children}</main>
      </div>
      <CommandPalette />
    </div>
  );
}
