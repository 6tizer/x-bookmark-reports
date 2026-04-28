"use client";

/**
 * Articles page — Article drafts list
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ClientLayout } from "@/components/layout/ClientLayout";
import { getArticles } from "@/lib/api";
import { Skeleton } from "@/components/ui/Skeleton";
import { Newspaper, Clock, Search, RefreshCw, PenLine } from "lucide-react";
import type { Article, ArticleStatus, PaginatedResponse } from "@/types/api";

export default function ArticlesPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ArticleStatus | undefined>(undefined);

  const fetchData = useCallback(async (status?: ArticleStatus, s?: string) => {
    setIsLoading(true);
    try {
      const res: PaginatedResponse<Article> = await getArticles(status, s);
      setArticles(res.items);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const statusColors: Record<ArticleStatus, string> = {
    draft: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    editing: "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
    reviewing: "bg-yellow-50 text-yellow-600 dark:bg-yellow-950 dark:text-yellow-400",
    published: "bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-400",
  };

  return (
    <ClientLayout>
      <div className="space-y-4 max-w-5xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">Articles</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{articles.length} drafts</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchData(statusFilter, search)}
                placeholder="Search articles..."
                className="h-8 rounded-md border border-border bg-muted px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring w-44"
              />
              <button
                onClick={() => fetchData(statusFilter, search)}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-muted transition-colors"
              >
                <Search size={14} />
              </button>
            </div>

            <select
              value={statusFilter || ""}
              onChange={(e) => {
                const val = e.target.value as ArticleStatus | "";
                setStatusFilter(val || undefined);
                fetchData(val || undefined, search);
              }}
              className="h-8 rounded-md border border-border bg-muted px-2 text-sm outline-none"
            >
              <option value="">All Status</option>
              <option value="draft">Draft</option>
              <option value="editing">Editing</option>
              <option value="reviewing">Reviewing</option>
              <option value="published">Published</option>
            </select>

            <button
              onClick={() => fetchData(statusFilter, search)}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-muted transition-colors"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-border bg-card p-4 flex items-center gap-4">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : articles.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <Newspaper size={32} className="mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No articles yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {articles.map((article) => (
              <Link
                key={article.id}
                href={`/articles/${article.id}`}
                className="group flex items-center gap-4 rounded-lg border border-border bg-card p-4 hover:shadow-sm hover:border-twitter-blue/30 transition-all"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <PenLine size={18} className="text-twitter-blue" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-foreground truncate group-hover:text-twitter-blue transition-colors">
                      {article.title}
                    </h3>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${statusColors[article.status]}`}>
                      {article.status}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-0.5">
                      <Clock size={11} />
                      {new Date(article.updatedAt).toLocaleDateString()}
                    </span>
                    <span>{article.wordCount.toLocaleString()} words</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </ClientLayout>
  );
}
