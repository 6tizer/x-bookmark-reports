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

const ReactMarkdown = dynamic(() => import("react-markdown"), { ssr: false });

const MODEL_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Default (env)" },
  { value: "deepseek-chat", label: "DeepSeek Chat" },
  { value: "deepseek-reasoner", label: "DeepSeek Reasoner" },
  { value: "grok-2-latest", label: "xAI Grok" },
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

export default function ArticleDetailPage() {
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
      setToast("Notion upload started (see server logs)");
      await load();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Upload failed");
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
      setToast("Pipeline started for this article");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Pipeline failed to start");
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
          <p className="text-muted-foreground">Article not found</p>
          <Link href="/articles" className="text-twitter-blue hover:underline text-sm mt-2 inline-block">
            Back to articles
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
        {toast && (
          <p className="text-xs text-muted-foreground mb-2 rounded-md border border-border bg-card px-3 py-2">
            {toast}
          </p>
        )}

        <div className="rounded-lg border border-border bg-card p-3 mb-3 text-xs space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Status</span>
            <span className="rounded-full bg-muted px-2 py-0.5 font-medium">{statusLabel(article.status)}</span>
            {article.author && (
              <>
                <span className="text-muted-foreground">·</span>
                <span>{article.author}</span>
              </>
            )}
            {article.generatedAt && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">Generated {new Date(article.generatedAt).toLocaleString()}</span>
              </>
            )}
          </div>
          {article.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {article.tags.map((t) => (
                <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                  {t}
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
              <ExternalLink size={12} /> Source tweet
            </a>
          )}
          {article.notionIcon && (
            <p className="text-muted-foreground">
              Notion icon:{" "}
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
              {MODEL_OPTIONS.map((o) => (
                <option key={o.value || "default"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={pipelineBusy}
              onClick={() => void handleRunPipeline()}
              className="flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] font-medium hover:bg-muted disabled:opacity-50"
            >
              <Play size={12} />
              {pipelineBusy ? "Starting…" : "Re-run pipeline"}
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
              <ArrowLeft size={14} /> Articles
            </Link>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-lg font-semibold bg-transparent outline-none border-b border-transparent focus:border-border px-1 -ml-1"
            />
          </div>

          <div className="flex items-center gap-1 flex-wrap justify-end">
            <div className="flex items-center rounded-md border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setViewMode("edit")}
                className={`flex h-7 items-center gap-1 px-2 text-[11px] ${viewMode === "edit" ? "bg-muted font-medium" : ""}`}
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => setViewMode("split")}
                className={`flex h-7 items-center gap-1 px-2 text-[11px] ${viewMode === "split" ? "bg-muted font-medium" : ""}`}
              >
                Split
              </button>
              <button
                type="button"
                onClick={() => setViewMode("preview")}
                className={`flex h-7 items-center gap-1 px-2 text-[11px] ${viewMode === "preview" ? "bg-muted font-medium" : ""}`}
              >
                <Eye size={12} /> Preview
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowVersions(!showVersions)}
              className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] hover:bg-muted transition-colors"
            >
              <History size={12} />
              {versions.length}
              <ChevronDown size={10} />
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !canEditFinal}
              title={!canEditFinal ? "Save available when article-final exists (written/uploaded)" : undefined}
              className="flex h-7 items-center gap-1 rounded-md bg-primary px-2 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Save size={12} />
              {isSaving ? "Saving..." : "Save"}
            </button>

            {showNotion && (
              <button
                type="button"
                onClick={() => void handleNotionUpload()}
                disabled={publishBusy}
                className="flex h-7 items-center gap-1 rounded-md bg-green-600 px-2 text-[11px] font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                <Send size={12} /> {publishBusy ? "…" : "Upload to Notion"}
              </button>
            )}
          </div>
        </div>

        {showVersions && versions.length > 0 && (
          <div className="mb-3 rounded-lg border border-border bg-card p-3">
            <p className="text-xs font-medium text-foreground mb-2">Version History</p>
            <div className="space-y-1.5">
              {versions.map((v) => (
                <div key={v.id} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {v.title} — {new Date(v.createdAt).toLocaleDateString()}
                  </span>
                  <span className="text-muted-foreground">{v.wordCount} words</span>
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
