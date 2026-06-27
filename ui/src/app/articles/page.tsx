"use client";

/**
 * Articles — deep drafts + article pipeline state (output/article-final)
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ClientLayout } from "@/components/layout/ClientLayout";
import { getArticles, triggerPipelineRun, triggerPipelineBatch } from "@/lib/api";
import { Skeleton } from "@/components/ui/Skeleton";
import { Newspaper, Clock, Search, RefreshCw, PenLine, Play, Layers } from "lucide-react";
import type { Article, ArticleStatus, PaginatedResponse } from "@/types/api";

const PIPELINE_FILTER_STATUSES: ArticleStatus[] = [
  "draft",
  "metadata_done",
  "researched",
  "written",
  "uploaded",
  "failed",
];

const PIPELINE_MODEL_STORAGE = "articlePipelineModel";

function statusLabel(s: ArticleStatus): string {
  const map: Partial<Record<ArticleStatus, string>> = {
    draft: "Draft",
    metadata_done: "Metadata",
    researched: "Researched",
    written: "Written",
    uploaded: "Uploaded",
    failed: "Failed",
    editing: "Editing",
    reviewing: "Reviewing",
    published: "Published",
  };
  return map[s] ?? s.replace(/_/g, " ");
}

export default function ArticlesPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ArticleStatus | undefined>(undefined);
  const [pipelineModel, setPipelineModel] = useState("");
  // 从 API 动态加载模型下拉选项（替代硬编码 MODEL_OPTIONS）
  const [modelOptions, setModelOptions] = useState<{ value: string; label: string }[]>([]);
  const [runBusyId, setRunBusyId] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const LIMIT = 20;
  // 二次确认 modal（in-page，避开浏览器 window.confirm 拦截 / webview 差异）
  const [confirmingArticle, setConfirmingArticle] = useState<Article | null>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem(PIPELINE_MODEL_STORAGE);
      if (v !== null) setPipelineModel(v);
    } catch {
      /* ignore */
    }
  }, []);

  // 拉取 /api/settings/model-options 填充模型下拉
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/settings/model-options");
        const json = await res.json();
        if (!cancelled && json.success && Array.isArray(json.data?.options)) {
          setModelOptions(json.data.options);
        }
      } catch {
        /* 加载失败时保持空数组，下拉显示 Loading... */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistModel = (v: string) => {
    setPipelineModel(v);
    try {
      localStorage.setItem(PIPELINE_MODEL_STORAGE, v);
    } catch {
      /* ignore */
    }
  };

  const fetchData = useCallback(async (status?: ArticleStatus, s?: string, pg: number = 1) => {
    setIsLoading(true);
    try {
      const res: PaginatedResponse<Article> = await getArticles(status, s, pg, LIMIT);
      setArticles(res.items);
      setTotal(res.total);
      setHasMore(res.hasMore);
      setPage(res.page);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const statusColors: Record<ArticleStatus, string> = {
    draft: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    metadata_done: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
    researched: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
    written: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    uploaded: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
    failed: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
    editing: "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
    reviewing: "bg-yellow-50 text-yellow-600 dark:bg-yellow-950 dark:text-yellow-400",
    published: "bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-400",
  };

  const executeRun = async (article: Article) => {
    setRunBusyId(article.id);
    setToast(null);
    try {
      await triggerPipelineRun({
        tweetId: article.id,
        model: pipelineModel || undefined,
      });
      setToast(`Pipeline started for ${article.id.slice(0, 12)}…`);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Failed to start pipeline");
    } finally {
      setRunBusyId(null);
    }
  };

  const onRunOne = (e: React.MouseEvent, article: Article) => {
    e.preventDefault();
    e.stopPropagation();
    // written/uploaded 状态弹出 in-page modal 二次确认；其它状态直接运行
    if (article.status === "written" || article.status === "uploaded") {
      setConfirmingArticle(article);
      return;
    }
    void executeRun(article);
  };

  const onRunBatch = async () => {
    setBatchBusy(true);
    setToast(null);
    try {
      await triggerPipelineBatch({
        model: pipelineModel || undefined,
        resume: true,
      });
      setToast("Batch pipeline started");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Failed to start batch");
    } finally {
      setBatchBusy(false);
    }
  };

  return (
    <ClientLayout>
      <div className="space-y-4 max-w-5xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">Articles</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {`${total} article${total === 1 ? "" : "s"} (deep drafts + pipeline)`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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
                type="button"
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
              <option value="">All pipeline status</option>
              {PIPELINE_FILTER_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {statusLabel(st)}
                </option>
              ))}
            </select>

            <span className="text-[11px] text-muted-foreground whitespace-nowrap">Run model</span>
            <select
              value={pipelineModel}
              onChange={(e) => persistModel(e.target.value)}
              title="单条 Run / Batch run 使用的 rewrite 模型"
              className="h-8 rounded-md border border-border bg-muted px-2 text-xs outline-none max-w-[140px]"
            >
              {modelOptions.length === 0 ? (
                <option disabled value="">
                  Loading...
                </option>
              ) : (
                modelOptions.map((o) => (
                  <option key={o.value || "default"} value={o.value}>
                    {o.label}
                  </option>
                ))
              )}
            </select>

            <button
              type="button"
              disabled={batchBusy}
              onClick={() => void onRunBatch()}
              className="flex h-8 items-center gap-1 rounded-md border border-border bg-muted px-2 text-xs font-medium hover:bg-muted/80 disabled:opacity-50"
            >
              <Layers size={14} />
              {batchBusy ? "Starting…" : "Batch run"}
            </button>

            <button
              type="button"
              onClick={() => fetchData(statusFilter, search)}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-muted transition-colors"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {toast && (
          <p className="text-xs text-muted-foreground rounded-md border border-border bg-card px-3 py-2">
            {toast}
          </p>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="rounded-lg border border-border bg-card p-4 flex items-center gap-4"
              >
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
              <div
                key={article.id}
                className="group flex items-center gap-3 rounded-lg border border-border bg-card p-4 hover:shadow-sm hover:border-twitter-blue/30 transition-all"
              >
                <Link
                  href={`/articles/${article.id}`}
                  className="flex flex-1 min-w-0 items-center gap-3"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <PenLine size={18} className="text-twitter-blue" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-medium text-foreground truncate group-hover:text-twitter-blue transition-colors">
                        {article.title}
                      </h3>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${statusColors[article.status]}`}
                      >
                        {statusLabel(article.status)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-0.5">
                        <Clock size={11} />
                        {new Date(article.updatedAt).toLocaleDateString()}
                      </span>
                      <span>{article.wordCount.toLocaleString()} words</span>
                      <span className="font-mono text-[10px] opacity-70 truncate max-w-[120px]">
                        {article.id}
                      </span>
                    </div>
                  </div>
                </Link>
                <div className="flex shrink-0 items-center gap-1">
                  {/* 与顶部工具栏共用 pipelineModel，Run 旁可直接选模型 */}
                  <select
                    value={pipelineModel}
                    onChange={(e) => persistModel(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    title="本条 Run 使用的模型"
                    className="h-8 max-w-[110px] rounded-md border border-border bg-background px-1 text-[10px] outline-none"
                  >
                    {modelOptions.length === 0 ? (
                      <option disabled value="">
                        …
                      </option>
                    ) : (
                      modelOptions.map((o) => (
                        <option key={`row-${o.value || "default"}`} value={o.value}>
                          {o.label}
                        </option>
                      ))
                    )}
                  </select>
                  <button
                  type="button"
                  title="Run article pipeline for this tweet"
                  data-run-button
                  data-article-status={article.status}
                  disabled={runBusyId === article.id}
                  onClick={(e) => onRunOne(e, article)}
                  className="shrink-0 flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] font-medium hover:bg-muted disabled:opacity-50"
                >
                  <Play size={12} />
                  {runBusyId === article.id ? "…" : "Run"}
                </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 翻页控件 — 列表底部 Previous / Page N / Next */}
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-muted-foreground">
            Showing {articles.length} of {total}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void fetchData(statusFilter, search, Math.max(1, page - 1))}
              disabled={page <= 1}
              className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50 transition-colors"
            >
              Previous
            </button>
            <span className="px-2 text-xs text-muted-foreground">Page {page}</span>
            <button
              type="button"
              onClick={() => void fetchData(statusFilter, search, page + 1)}
              disabled={!hasMore}
              className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50 transition-colors"
            >
              Next
            </button>
          </div>
        </div>

        {confirmingArticle && (
          <div
            data-testid="run-confirm-modal"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
            onClick={(e) => {
              if (e.target === e.currentTarget) setConfirmingArticle(null);
            }}
          >
            <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
              <h2 className="text-base font-semibold text-foreground">
                {confirmingArticle.status === "uploaded"
                  ? "该文章已上传 Notion"
                  : "该文章已成文"}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                「{confirmingArticle.title.slice(0, 60)}
                {confirmingArticle.title.length > 60 ? "…" : ""}」
              </p>
              <p className="mt-2 text-sm text-foreground">
                再次运行 pipeline 会
                <span className="font-medium text-red-600 dark:text-red-400">
                  覆盖
                </span>
                现有结果。确认继续吗？
              </p>
              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmingArticle(null)}
                  className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const target = confirmingArticle;
                    setConfirmingArticle(null);
                    void executeRun(target);
                  }}
                  className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 transition-colors"
                >
                  确认运行
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ClientLayout>
  );
}
