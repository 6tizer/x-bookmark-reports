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
  Newspaper,
  Settings,
  Search,
} from "lucide-react";
import { useBookmarkStore } from "@/store/useBookmarkStore";
import { mockBookmarks, mockArticles } from "@/db/mock";
import { cn } from "@/lib/utils";
import { useT, type MessageKey } from "@/lib/i18n";

// /reports 路由已删除（PR-3 死代码清理），导航条不再展示 Reports
const pageNavItems: { labelKey: MessageKey; href: string; icon: typeof LayoutDashboard }[] = [
  { labelKey: "common.nav.dashboard", href: "/", icon: LayoutDashboard },
  { labelKey: "common.nav.bookmarks", href: "/bookmarks", icon: Bookmark },
  { labelKey: "common.nav.sync", href: "/sync", icon: RefreshCw },
  { labelKey: "common.nav.articles", href: "/articles", icon: Newspaper },
  { labelKey: "common.nav.settings", href: "/settings", icon: Settings },
];

export function CommandPalette() {
  const { commandPaletteOpen, setCommandPaletteOpen } = useUIStore();
  const [search, setSearch] = useState("");
  const router = useRouter();
  const bookmarkStore = useBookmarkStore();
  const t = useT();

  // Load mock data into stores if empty
  useEffect(() => {
    if (bookmarkStore.bookmarks.length === 0) {
      bookmarkStore.setBookmarks(mockBookmarks);
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
              placeholder={t("layout.palette.placeholder")}
              className="flex-1 h-11 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              autoFocus
            />
          </div>

          <Command.List className="max-h-[60vh] overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              {t("layout.palette.empty")}
            </Command.Empty>

            {/* Navigation */}
            <Command.Group heading={t("layout.palette.group.navigation")}>
              {pageNavItems
                .map((item) => ({ ...item, label: t(item.labelKey) }))
                .filter((item) => {
                  // 同时匹配当前语言的名称和路由路径，中文界面下输入英文也能跳转
                  const q = search.toLowerCase();
                  return item.label.toLowerCase().includes(q) || item.href.includes(q);
                })
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
              <Command.Group heading={t("layout.palette.group.bookmarks")}>
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

            {/* Articles */}
            {filteredArticles.length > 0 && (
              <Command.Group heading={t("layout.palette.group.articles")}>
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
              <kbd className="rounded border border-border bg-background px-1">↑↓</kbd> {t("layout.palette.hint.navigate")}
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-background px-1">↵</kbd> {t("layout.palette.hint.select")}
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-background px-1">esc</kbd> {t("layout.palette.hint.close")}
            </span>
          </div>
        </Command>
      </div>
    </div>
  );
}
