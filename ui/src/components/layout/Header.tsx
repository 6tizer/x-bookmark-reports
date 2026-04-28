"use client";

/**
 * Header — Top header with breadcrumb, search, theme toggle, avatar
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUIStore } from "@/store/useUIStore";
import { useTheme } from "@/hooks/useTheme";
import { Search, Sun, Moon, Monitor, ChevronRight, User } from "lucide-react";
import { cn } from "@/lib/utils";

function getBreadcrumb(pathname: string): { label: string; href?: string }[] {
  if (pathname === "/") return [{ label: "Dashboard" }];
  const parts = pathname.split("/").filter(Boolean);
  const crumbs: { label: string; href?: string }[] = [{ label: "Home", href: "/" }];
  const labelMap: Record<string, string> = {
    bookmarks: "Bookmarks",
    sync: "Sync",
    reports: "Reports",
    articles: "Articles",
    settings: "Settings",
  };
  parts.forEach((part, i) => {
    if (i === 0) {
      crumbs.push({
        label: labelMap[part] || part,
        href: `/${part}`,
      });
    } else {
      crumbs.push({ label: part.slice(0, 12) });
    }
  });
  return crumbs;
}

export function Header() {
  const pathname = usePathname();
  const { toggleCommandPalette } = useUIStore();
  const { resolved, toggle } = useTheme();
  const breadcrumb = getBreadcrumb(pathname);

  return (
    <header className="flex h-12 items-center justify-between border-b border-border bg-background px-4">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm">
        {breadcrumb.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && (
              <ChevronRight size={14} className="text-notion-text-muted" />
            )}
            {crumb.href && i < breadcrumb.length - 1 ? (
              <Link
                href={crumb.href}
                className="text-notion-text-muted hover:text-notion-text dark:hover:text-notion-text-dark transition-colors"
              >
                {crumb.label}
              </Link>
            ) : (
              <span className="font-medium text-notion-text dark:text-notion-text-dark">
                {crumb.label}
              </span>
            )}
          </span>
        ))}
      </nav>

      {/* Right actions */}
      <div className="flex items-center gap-1">
        {/* Search */}
        <button
          onClick={toggleCommandPalette}
          className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-muted px-2.5 text-xs text-muted-foreground hover:bg-notion-hover dark:hover:bg-notion-hover-dark transition-colors"
        >
          <Search size={14} />
          <span className="hidden sm:inline">Search</span>
          <kbd className="hidden sm:inline-flex h-5 items-center rounded border border-border bg-background px-1 text-[10px] font-mono">
            ⌘K
          </kbd>
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-md hover:bg-notion-hover dark:hover:bg-notion-hover-dark transition-colors"
          )}
          aria-label="Toggle theme"
        >
          {resolved === "dark" ? <Moon size={16} /> : <Sun size={16} />}
        </button>

        {/* User avatar placeholder */}
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <User size={14} />
        </div>
      </div>
    </header>
  );
}
