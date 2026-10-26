"use client";

/**
 * Sidebar — Left sidebar, collapsible, tree navigation
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUIStore } from "@/store/useUIStore";
import {
  LayoutDashboard,
  Bookmark,
  RefreshCw,
  Newspaper,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT, type MessageKey } from "@/lib/i18n";

/** `articles` is wired to `DashboardStats.totalArticlesLocal` (output/article-final count).
 *  `bookmarks` accepts string form like "1584/642" (totalBookmarks/totalDrafts). */
export interface SidebarCounts {
  bookmarks?: string | number;
  articles?: number;
}

interface NavItem {
  href: string;
  labelKey: MessageKey;
  icon: React.ReactNode;
  badgeFrom?: keyof SidebarCounts;
}

const navItems: NavItem[] = [
  { href: "/", labelKey: "common.nav.dashboard", icon: <LayoutDashboard size={18} /> },
  {
    href: "/bookmarks",
    labelKey: "common.nav.bookmarks",
    icon: <Bookmark size={18} />,
    badgeFrom: "bookmarks",
  },
  { href: "/sync", labelKey: "common.nav.sync", icon: <RefreshCw size={18} /> },
  {
    href: "/articles",
    labelKey: "common.nav.articles",
    icon: <Newspaper size={18} />,
    badgeFrom: "articles",
  },
  { href: "/settings", labelKey: "common.nav.settings", icon: <Settings size={18} /> },
];

export function Sidebar({ counts }: { counts?: SidebarCounts }) {
  const { sidebarOpen, toggleSidebar } = useUIStore();
  const pathname = usePathname();
  const t = useT();

  return (
    <aside
      className={cn(
        // 底色必须带 dark:。notion-sidebar 是写死的浅色 #f7f6f3，
        // 菜单文字在 .dark 下会变成浅色，否则就是浅字落在白底上。
        "fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-border bg-notion-sidebar dark:bg-notion-sidebar-dark transition-all duration-300",
        sidebarOpen ? "w-60" : "w-14"
      )}
    >
      <div className="flex h-12 items-center gap-2 px-3 border-b border-border">
        {sidebarOpen && (
          <>
            <div className="flex h-6 w-6 items-center justify-center rounded bg-twitter-blue text-white text-xs font-bold">
              X
            </div>
            <span className="text-sm font-semibold text-notion-text dark:text-notion-text-dark truncate">
              {t("layout.sidebar.brand")}
            </span>
          </>
        )}
        <button
          onClick={toggleSidebar}
          className={cn(
            "ml-auto flex h-6 w-6 items-center justify-center rounded hover:bg-notion-hover dark:hover:bg-notion-hover-dark transition-colors",
            !sidebarOpen && "mx-auto"
          )}
          aria-label={sidebarOpen ? t("layout.sidebar.collapse") : t("layout.sidebar.expand")}
        >
          {sidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        <ul className="space-y-0.5 px-1.5">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const badge =
              item.badgeFrom && counts?.[item.badgeFrom] !== undefined
                ? counts[item.badgeFrom]
                : undefined;
            const label = t(item.labelKey);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                    isActive
                      ? "bg-notion-hover dark:bg-notion-hover-dark text-notion-text dark:text-notion-text-dark font-medium"
                      : "text-notion-text/70 dark:text-notion-text-dark/70 hover:bg-notion-hover dark:hover:bg-notion-hover-dark hover:text-notion-text dark:hover:text-notion-text-dark"
                  )}
                  title={label}
                >
                  <span className={cn("shrink-0", isActive && "text-twitter-blue")}>
                    {item.icon}
                  </span>
                  {sidebarOpen && (
                    <>
                      <span className="flex-1 truncate">{label}</span>
                      {badge !== undefined && (
                        <span className="ml-auto rounded-md bg-notion-hover dark:bg-notion-hover-dark px-1.5 py-0.5 text-[10px] font-medium text-notion-text-muted">
                          {badge}
                        </span>
                      )}
                    </>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {sidebarOpen && (
        <div className="border-t border-border p-3">
          <p className="text-[10px] text-notion-text-muted leading-tight">
            x-bookmark-reports v1.0
          </p>
        </div>
      )}
    </aside>
  );
}
