"use client";

/**
 * Header — Top header with breadcrumb, search, theme toggle, avatar
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUIStore } from "@/store/useUIStore";
import { useTheme } from "@/hooks/useTheme";
import { Search, Sun, Moon, ChevronRight, User, Languages } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n, type TFunction } from "@/lib/i18n";

function getBreadcrumb(pathname: string, t: TFunction): { label: string; href?: string }[] {
  if (pathname === "/") return [{ label: t("common.nav.dashboard") }];
  const parts = pathname.split("/").filter(Boolean);
  const crumbs: { label: string; href?: string }[] = [{ label: t("common.nav.home"), href: "/" }];
  const labelMap: Record<string, string> = {
    bookmarks: t("common.nav.bookmarks"),
    sync: t("common.nav.sync"),
    reports: t("common.nav.reports"),
    articles: t("common.nav.articles"),
    settings: t("common.nav.settings"),
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
  const { t, toggleLocale } = useI18n();
  const breadcrumb = getBreadcrumb(pathname, t);

  return (
    <header className="flex h-12 items-center justify-between border-b border-border bg-background px-4">
      {/* Breadcrumb */}
      <nav aria-label={t("common.nav.breadcrumb")} className="flex items-center gap-1 text-sm">
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
          <span className="hidden sm:inline">{t("common.action.search")}</span>
          <kbd className="hidden sm:inline-flex h-5 items-center rounded border border-border bg-background px-1 text-[10px] font-mono">
            ⌘K
          </kbd>
        </button>

        {/* Language toggle：显示切换后的目标语言 */}
        <button
          onClick={toggleLocale}
          className="flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-notion-hover dark:hover:bg-notion-hover-dark transition-colors"
          aria-label={t("common.language.switch")}
          title={t("common.language.switch")}
        >
          <Languages size={14} />
          {t("common.language.toggleLabel")}
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-md hover:bg-notion-hover dark:hover:bg-notion-hover-dark transition-colors"
          )}
          aria-label={t("common.theme.toggle")}
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
