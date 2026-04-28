"use client";

/**
 * CommandPalette — Cmd+K global search + navigation
 * Uses cmdk library
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { useUIStore } from "@/store/useUIStore";
import {
  LayoutDashboard,
  Bookmark,
  RefreshCw,
  FileText,
  Newspaper,
  Settings,
  Search,
} from "lucide-react";
import { useBookmarkStore } from "@/store/useBookmarkStore";
import { useReportStore } from "@/store/useReportStore";
import { mockBookmarks, mockReports, mockArticles } from "@/db/mock";
import { cn } from "@/lib/utils";

const pageNavItems = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Bookmarks", href: "/bookmarks", icon: Bookmark },
  { label: "Sync", href: "/sync", icon: RefreshCw },
  { label: "Reports", href: "/reports", icon: FileText },
  { label: "Articles", href: "/articles", icon: Newspaper },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function CommandPalette() {
  const { commandPaletteOpen, setCommandPaletteOpen } = useUIStore();
  const [search, setSearch] = useState("");
  const router = useRouter();
  const bookmarkStore = useBookmarkStore();
  const reportStore = useReportStore();

  // Load mock data into stores if empty
  useEffect(() => {
    if (bookmarkStore.bookmarks.length === 0) {
      bookmarkStore.setBookmarks(mockBookmarks);
    }
    if (reportStore.reports.length === 0) {
      reportStore.setReports(mockReports);
    }
  }, []);

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      }
      if (e.key === "Escape") {
        setCommandPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  const filteredBookmarks = useMemo(() => {
    if (!search.trim()) return mockBookmarks.slice(0, 5);
    const q = search.toLowerCase();
    return mockBookmarks
      .filter(
        (b) =>
          b.text.toLowerCase().includes(q) ||
          b.author.name.toLowerCase().includes(q) ||
          b.tags.some((t) => t.toLowerCase().includes(q))
      )
      .slice(0, 5);
  }, [search]);

  const filteredReports = useMemo(() => {
    if (!search.trim()) return mockReports.slice(0, 5);
    const q = search.toLowerCase();
    return mockReports
      .filter((r) => r.title.toLowerCase().includes(q))
      .slice(0, 5);
  }, [search]);

  const filteredArticles = useMemo(() => {
    if (!search.trim()) return mockArticles.slice(0, 5);
    const q = search.toLowerCase();
    return mockArticles
      .filter((a) => a.title.toLowerCase().includes(q))
      .slice(0, 5);
  }, [search]);

  const handleSelect = (href: string) => {
    router.push(href);
    setCommandPaletteOpen(false);
    setSearch("");
  };

  if (!commandPaletteOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[15vh]">
      <div
        className="w-full max-w-xl overflow-hidden rounded-lg border border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <Command
          className="[&_[cmdk-input-wrapper]]:border-b [&_[cmdk-input-wrapper]]:border-border"
          loop
        >
          <div className="flex items-center gap-2 px-3 border-b border-border">
            <Search size={16} className="text-muted-foreground shrink-0" />
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Search bookmarks, reports, articles, or navigate..."
              className="flex-1 h-11 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              autoFocus
            />
          </div>

          <Command.List className="max-h-[60vh] overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              No results found.
            </Command.Empty>

            {/* Navigation */}
            <Command.Group heading="Navigation">
              {pageNavItems
                .filter((item) => item.label.toLowerCase().includes(search.toLowerCase()))
                .map((item) => (
                  <Command.Item
                    key={item.href}
                    onSelect={() => handleSelect(item.href)}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer",
                      "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                    )}
                  >
                    <item.icon size={16} className="shrink-0 text-muted-foreground" />
                    <span>{item.label}</span>
                  </Command.Item>
                ))}
            </Command.Group>

            {/* Bookmarks */}
            {filteredBookmarks.length > 0 && (
              <Command.Group heading="Bookmarks">
                {filteredBookmarks.map((b) => (
                  <Command.Item
                    key={b.id}
                    onSelect={() => handleSelect(`/bookmarks/${b.id}`)}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer",
                      "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                    )}
                  >
                    <Bookmark size={14} className="shrink-0 text-twitter-blue" />
                    <span className="flex-1 truncate">{b.text.slice(0, 60)}...</span>
                    <span className="text-xs text-muted-foreground">{b.author.name}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Reports */}
            {filteredReports.length > 0 && (
              <Command.Group heading="Reports">
                {filteredReports.map((r) => (
                  <Command.Item
                    key={r.id}
                    onSelect={() => handleSelect(`/reports/${r.id}`)}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer",
                      "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                    )}
                  >
                    <FileText size={14} className="shrink-0 text-muted-foreground" />
                    <span className="truncate">{r.title}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Articles */}
            {filteredArticles.length > 0 && (
              <Command.Group heading="Articles">
                {filteredArticles.map((a) => (
                  <Command.Item
                    key={a.id}
                    onSelect={() => handleSelect(`/articles/${a.id}`)}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer",
                      "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                    )}
                  >
                    <Newspaper size={14} className="shrink-0 text-muted-foreground" />
                    <span className="truncate">{a.title}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>

          <div className="flex items-center gap-3 border-t border-border bg-muted px-3 py-1.5 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-background px-1">↑↓</kbd> to navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-background px-1">↵</kbd> to select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-background px-1">esc</kbd> to close
            </span>
          </div>
        </Command>
      </div>
    </div>
  );
}
