"use client";

/**
 * Article detail — Markdown editor + pipeline controls
 */

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import remarkGfm from "remark-gfm";
import { ClientLayout } from "@/components/layout/ClientLayout";
import {
  getArticleByIdAPI,
  updateArticle,
  getArticleVersions,
  publishArticle,
  triggerPipelineRun,
} from "@/lib/api";
import { Skeleton } from "@/components/ui/Skeleton";
// 统一按产品时区（Asia/Singapore）展示日期
import { formatDate, formatDateTime } from "@/lib/format-date";
import {
  ArrowLeft,
  Save,
  Eye,
  History,
  Send,
  ChevronDown,
  Play,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import type { Article, ArticleStatus, ArticleVersion } from "@/types/api";
import { useT, hasMessage, type MessageKey, type TFunction } from "@/lib/i18n";

const ReactMarkdown = dynamic(() => import("react-markdown"), { ssr: false });

const PIPELINE_MODEL_STORAGE = "articlePipelineModel";

// /api/settings/model-options 返回的下拉选项
interface ModelOption {
  value: string;
  label: string;
  i18nKey?: "default" | "envCustom" | "deepseekFlash" | "deepseekPro";
  params?: { model: string };
}

function modelOptionLabel(o: ModelOption, t: TFunction): string {
  return o.i18nKey ? t(`articles.model.${o.i18nKey}` as MessageKey, o.params) : o.label;
}

function statusLabel(s: ArticleStatus, t: TFunction): string {
  const key = `articles.status.${s}`;
  return hasMessage(key) ? t(key as MessageKey) : s.replace(/_/g, " ");
}

export default function ArticleDetailPage() {
  const t = useT();
  const params = useParams();
  const id = params.id as string;
  const [article, setArticle] = useState<Article | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [viewMode, setViewMode] = useState<"edit" | "split" | "preview">("split");
  const [versions, setVersions] = useState<ArticleVersion[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [pipelineModel, setPipelineModel] = useState("");
  // 从 API 动态加载模型下拉选项（替代硬编码 MODEL_OPTIONS）
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [pipelineBusy, setPipelineBusy] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

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

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getArticleByIdAPI(id);
      setArticle(data);
      setContent(data.content);
      setTitle(data.title);
      const vers = await getArticleVersions(id);
      setVersions(vers);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updated = await updateArticle(id, { title, content });
      setArticle(updated);
    } finally {
      setIsSaving(false);
    }
  };

  const handleNotionUpload = async () => {
    setPublishBusy(true);
    setToast(null);
    try {
      await publishArticle(id, "markdown");
      setToast(t("articles.detail.toast.uploadStarted"));
      await load();
    } catch (e) {
      setToast(e instanceof Error ? e.message : t("articles.detail.toast.uploadFailed"));
    } finally {
      setPublishBusy(false);
    }
  };

  const handleRunPipeline = async () => {
    setPipelineBusy(true);
    setToast(null);
    try {
      await triggerPipelineRun({
        tweetId: id,
        model: pipelineModel || undefined,
      });
      setToast(t("articles.detail.toast.pipelineStarted"));
    } catch (e) {
      setToast(e instanceof Error ? e.message : t("articles.detail.toast.pipelineFailed"));
    } finally {
      setPipelineBusy(false);
    }
  };

  if (isLoading) {
    return (
      <ClientLayout>
        <div className="max-w-5xl space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-[60vh] w-full" />
        </div>
      </ClientLayout>
    );
  }

  if (!article) {
    return (
      <ClientLayout>
        <div className="max-w-5xl text-center py-12">
          <p className="text-muted-foreground">{t("articles.detail.notFound")}</p>
          <Link href="/articles" className="text-twitter-blue hover:underline text-sm mt-2 inline-block">
            {t("articles.detail.backToList")}
          </Link>
        </div>
      </ClientLayout>
    );
  }

  const canEditFinal = article.status === "written" || article.status === "uploaded";
  const showNotion =
    article.status === "written" || article.status === "uploaded" || article.status === "failed";

  return (
    <ClientLayout>
      <div className="h-[calc(100vh-6rem)] max-w-5xl">
        {/* Stage 4：面包屑导航 Home › Articles › {title} */}
        <nav className="text-xs text-muted-foreground mb-3" aria-label={t("articles.detail.breadcrumb")}>
          <ol className="flex items-center gap-1 flex-wrap">
            <li>
              <Link href="/" className="hover:text-foreground transition-colors">{t("common.nav.home")}</Link>
            </li>
            <li className="opacity-50">›</li>
            <li>
              <Link href="/articles" className="hover:text-foreground transition-colors">{t("common.nav.articles")}</Link>
            </li>
            <li className="opacity-50">›</li>
            <li className="text-foreground font-medium truncate max-w-md">
              {(title || article.title).slice(0, 40)}{(title || article.title).length > 40 ? "…" : ""}
            </li>
          </ol>
        </nav>

        {toast && (
          <p className="text-xs text-muted-foreground mb-2 rounded-md border border-border bg-card px-3 py-2">
            {toast}
          </p>
        )}

        <div className="rounded-lg border border-border bg-card p-3 mb-3 text-xs space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">{t("articles.detail.status")}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 font-medium">{statusLabel(article.status, t)}</span>
            {article.author && (
              <>
                <span className="text-muted-foreground">·</span>
                <span>{article.author}</span>
              </>
            )}
            {article.generatedAt && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">
                  {t("articles.detail.generated", { time: formatDateTime(article.generatedAt) })}
                </span>
              </>
            )}
          </div>
          {article.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {article.tags.map((tag) => (
                <span key={tag} className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                  {tag}
                </span>
              ))}
            </div>
          )}
          {article.sourceUrl && (
            <a
              href={article.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-twitter-blue hover:underline"
            >
              <ExternalLink size={12} /> {t("articles.detail.sourceTweet")}
            </a>
          )}
          {article.notionIcon && (
            <p className="text-muted-foreground">
              {t("articles.detail.notionIcon")}{" "}
              <span className="font-mono text-[10px] break-all">{article.notionIcon}</span>
            </p>
          )}
          {article.lastError && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span className="whitespace-pre-wrap">{article.lastError}</span>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <select
              value={pipelineModel}
              onChange={(e) => persistModel(e.target.value)}
              className="h-7 rounded-md border border-border bg-background px-2 text-[11px] outline-none"
            >
              {modelOptions.length === 0 ? (
                <option disabled value="">{t("common.status.loading")}</option>
              ) : (
                modelOptions.map((o) => (
                  <option key={o.value || "default"} value={o.value}>
                    {modelOptionLabel(o, t)}
                  </option>
                ))
              )}
            </select>
            <button
              type="button"
              disabled={pipelineBusy}
              onClick={() => void handleRunPipeline()}
              className="flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] font-medium hover:bg-muted disabled:opacity-50"
            >
              <Play size={12} />
              {pipelineBusy ? t("articles.starting") : t("articles.detail.rerun")}
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Link
              href="/articles"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft size={14} /> {t("common.nav.articles")}
            </Link>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-lg font-semibold bg-transparent outline-none border-b border-transparent focus:border-border px-1 -ml-1"
            />
          </div>

          <div className="flex items-center gap-1 flex-wrap justify-end">
            {/* View 组：编辑视图切换 + 历史版本 */}
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wider mr-0.5">{t("articles.detail.group.view")}</span>
              <div className="flex items-center rounded-md border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setViewMode("edit")}
                  className={`flex h-7 items-center gap-1 px-2 text-[11px] ${viewMode === "edit" ? "bg-muted font-medium" : ""}`}
                >
                  {t("articles.detail.view.edit")}
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("split")}
                  className={`flex h-7 items-center gap-1 px-2 text-[11px] ${viewMode === "split" ? "bg-muted font-medium" : ""}`}
                >
                  {t("articles.detail.view.split")}
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("preview")}
                  className={`flex h-7 items-center gap-1 px-2 text-[11px] ${viewMode === "preview" ? "bg-muted font-medium" : ""}`}
                >
                  <Eye size={12} /> {t("articles.detail.view.preview")}
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowVersions(!showVersions)}
                title={t("articles.detail.versionHistory")}
                className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] hover:bg-muted transition-colors"
              >
                <History size={12} />
                {versions.length}
                <ChevronDown size={10} />
              </button>
            </div>

            {/* Article 组：文章修改操作 */}
            <div className="flex items-center gap-1">
              <span aria-hidden className="mx-1 h-5 w-px bg-border" />
              <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wider mr-0.5">{t("articles.detail.group.article")}</span>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving || !canEditFinal}
                title={!canEditFinal ? t("articles.detail.saveDisabledTitle") : undefined}
                className="flex h-7 items-center gap-1 rounded-md bg-primary px-2 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                <Save size={12} />
                {isSaving ? t("common.action.saving") : t("common.action.save")}
              </button>
            </div>

            {/* Pipeline 组：管线操作（仅 showNotion 时显示） */}
            {showNotion && (
              <div className="flex items-center gap-1">
                <span aria-hidden className="mx-1 h-5 w-px bg-border" />
                <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wider mr-0.5">{t("articles.detail.group.pipeline")}</span>
                <button
                  type="button"
                  onClick={() => void handleNotionUpload()}
                  disabled={publishBusy}
                  className="flex h-7 items-center gap-1 rounded-md bg-green-600 px-2 text-[11px] font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  <Send size={12} /> {publishBusy ? "…" : t("articles.detail.uploadNotion")}
                </button>
              </div>
            )}
          </div>
        </div>

        {showVersions && versions.length > 0 && (
          <div className="mb-3 rounded-lg border border-border bg-card p-3">
            <p className="text-xs font-medium text-foreground mb-2">{t("articles.detail.versionHistory")}</p>
            <div className="space-y-1.5">
              {versions.map((v) => (
                <div key={v.id} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {v.title} — {formatDate(v.createdAt)}
                  </span>
                  <span className="text-muted-foreground">{t("articles.words", { count: v.wordCount })}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div
          className={`flex-1 h-[calc(100%-3rem)] overflow-hidden ${
            viewMode === "split" ? "grid grid-cols-2 gap-4" : ""
          }`}
        >
          {(viewMode === "edit" || viewMode === "split") && (
            <div className="flex flex-col h-full rounded-lg border border-border bg-card overflow-hidden">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                readOnly={!canEditFinal}
                className="flex-1 resize-none bg-background p-4 font-mono text-xs leading-relaxed outline-none disabled:opacity-60"
                spellCheck={false}
              />
            </div>
          )}

          {(viewMode === "preview" || viewMode === "split") && (
            <div className="flex flex-col h-full rounded-lg border border-border bg-card overflow-hidden">
              <div className="flex-1 overflow-y-auto p-4 prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm as never]}>{content}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      </div>
    </ClientLayout>
  );
}
