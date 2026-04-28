"use client";

/**
 * Article detail page — Simplified Markdown editor
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ClientLayout } from "@/components/layout/ClientLayout";
import { getArticleByIdAPI, updateArticle, getArticleVersions, publishArticle } from "@/lib/api";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  ArrowLeft,
  Save,
  Eye,
  History,
  Send,
  ChevronDown,
} from "lucide-react";
import type { Article, ArticleVersion } from "@/types/api";

const ReactMarkdown = dynamic(() => import("react-markdown"), { ssr: false });
const RemarkGfm = dynamic(() => import("remark-gfm"), { ssr: false });

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

  useEffect(() => {
    const fetch = async () => {
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
    };
    fetch();
  }, [id]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updated = await updateArticle(id, { title, content });
      setArticle(updated);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async () => {
    await publishArticle(id, "markdown");
    const updated = await getArticleByIdAPI(id);
    setArticle(updated);
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

  return (
    <ClientLayout>
      <div className="h-[calc(100vh-6rem)] max-w-5xl">
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

          <div className="flex items-center gap-1">
            <div className="flex items-center rounded-md border border-border overflow-hidden">
              <button
                onClick={() => setViewMode("edit")}
                className={`flex h-7 items-center gap-1 px-2 text-[11px] ${viewMode === "edit" ? "bg-muted font-medium" : ""}`}
              >
                Edit
              </button>
              <button
                onClick={() => setViewMode("split")}
                className={`flex h-7 items-center gap-1 px-2 text-[11px] ${viewMode === "split" ? "bg-muted font-medium" : ""}`}
              >
                Split
              </button>
              <button
                onClick={() => setViewMode("preview")}
                className={`flex h-7 items-center gap-1 px-2 text-[11px] ${viewMode === "preview" ? "bg-muted font-medium" : ""}`}
              >
                <Eye size={12} /> Preview
              </button>
            </div>

            <button
              onClick={() => setShowVersions(!showVersions)}
              className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] hover:bg-muted transition-colors"
            >
              <History size={12} />
              {versions.length}
              <ChevronDown size={10} />
            </button>

            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex h-7 items-center gap-1 rounded-md bg-primary px-2 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Save size={12} />
              {isSaving ? "Saving..." : "Save"}
            </button>

            {article.status !== "published" && (
              <button
                onClick={handlePublish}
                className="flex h-7 items-center gap-1 rounded-md bg-green-600 px-2 text-[11px] font-medium text-white hover:bg-green-700 transition-colors"
              >
                <Send size={12} /> Publish
              </button>
            )}
          </div>
        </div>

        {/* Versions panel */}
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

        {/* Editor */}
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
                className="flex-1 resize-none bg-background p-4 font-mono text-xs leading-relaxed outline-none"
                spellCheck={false}
              />
            </div>
          )}

          {(viewMode === "preview" || viewMode === "split") && (
            <div className="flex flex-col h-full rounded-lg border border-border bg-card overflow-hidden">
              <div className="flex-1 overflow-y-auto p-4 prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[RemarkGfm]}>
                  {content}
                </ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      </div>
    </ClientLayout>
  );
}
