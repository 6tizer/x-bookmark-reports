"use client";

/**
 * ReportPreview — Split screen: Markdown editor + react-markdown preview
 */

import { useState } from "react";
import dynamic from "next/dynamic";
import { Edit3, Eye, Save, Download, History } from "lucide-react";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { Report, ReportVersion } from "@/types/api";
import { Skeleton } from "@/components/ui/Skeleton";

const ReactMarkdown = dynamic(() => import("react-markdown"), { ssr: false });

interface ReportPreviewProps {
  report: Report | null;
  versions: ReportVersion[];
  isLoading: boolean;
  isEditing: boolean;
  editContent: string;
  onEditContentChange: (content: string) => void;
  onToggleEdit: () => void;
  onSave: () => void;
  onExport: (format: "md" | "pdf") => void;
  onShowVersions: () => void;
}

export function ReportPreview({
  report,
  versions,
  isLoading,
  isEditing,
  editContent,
  onEditContentChange,
  onToggleEdit,
  onSave,
  onExport,
  onShowVersions,
}: ReportPreviewProps) {
  const [viewMode, setViewMode] = useState<"split" | "edit" | "preview">("split");

  if (isLoading || !report) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-4 w-1/4" />
        <div className="space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border pb-3 mb-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{report.title}</h1>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
            <span className="capitalize">{report.type}</span>
            <span>•</span>
            <span>{report.wordCount.toLocaleString()} words</span>
            <span>•</span>
            <span>{new Date(report.generatedAt).toLocaleDateString()}</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* View toggle */}
          <div className="flex items-center rounded-md border border-border overflow-hidden">
            <button
              onClick={() => setViewMode("edit")}
              className={`flex h-7 items-center gap-1 px-2 text-[11px] ${
                viewMode === "edit" ? "bg-muted font-medium" : "hover:bg-muted/50"
              }`}
            >
              <Edit3 size={12} /> Edit
            </button>
            <button
              onClick={() => setViewMode("split")}
              className={`flex h-7 items-center gap-1 px-2 text-[11px] ${
                viewMode === "split" ? "bg-muted font-medium" : "hover:bg-muted/50"
              }`}
            >
              Split
            </button>
            <button
              onClick={() => setViewMode("preview")}
              className={`flex h-7 items-center gap-1 px-2 text-[11px] ${
                viewMode === "preview" ? "bg-muted font-medium" : "hover:bg-muted/50"
              }`}
            >
              <Eye size={12} /> Preview
            </button>
          </div>

          <button
            onClick={onToggleEdit}
            className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] hover:bg-muted transition-colors"
          >
            <Edit3 size={12} />
            {isEditing ? "Done" : "Edit"}
          </button>

          <button
            onClick={onSave}
            className="flex h-7 items-center gap-1 rounded-md bg-primary px-2 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Save size={12} />
            Save
          </button>

          <button
            onClick={() => onExport("md")}
            className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] hover:bg-muted transition-colors"
          >
            <Download size={12} />
            Export
          </button>

          <button
            onClick={onShowVersions}
            className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] hover:bg-muted transition-colors"
          >
            <History size={12} />
            {versions.length}
          </button>
        </div>
      </div>

      {/* Content area */}
      <div
        className={`flex-1 overflow-hidden ${
          viewMode === "split" ? "grid grid-cols-2 gap-4" : ""
        }`}
      >
        {(viewMode === "edit" || viewMode === "split") && (
          <div className="flex flex-col h-full rounded-lg border border-border bg-card overflow-hidden">
            <div className="flex items-center gap-1 border-b border-border bg-muted px-2 py-1">
              <Edit3 size={12} className="text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">Markdown</span>
            </div>
            <textarea
              value={editContent}
              onChange={(e) => onEditContentChange(e.target.value)}
              className="flex-1 resize-none bg-background p-3 font-mono text-xs leading-relaxed outline-none"
              spellCheck={false}
            />
          </div>
        )}

        {(viewMode === "preview" || viewMode === "split") && (
          <div className="flex flex-col h-full rounded-lg border border-border bg-card overflow-hidden">
            <div className="flex items-center gap-1 border-b border-border bg-muted px-2 py-1">
              <Eye size={12} className="text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">Preview</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm as never]}
                rehypePlugins={[rehypeHighlight as never]}
                components={{
                  h1: ({ children }) => <h1 className="text-xl font-bold mt-4 mb-2">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-lg font-semibold mt-3 mb-2">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-base font-medium mt-2 mb-1">{children}</h3>,
                  p: ({ children }) => <p className="text-sm leading-relaxed mb-2">{children}</p>,
                  ul: ({ children }) => <ul className="list-disc pl-5 mb-2 text-sm">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 text-sm">{children}</ol>,
                  li: ({ children }) => <li className="mb-0.5">{children}</li>,
                  code: ({ className, children }) => {
                    const isInline = !className;
                    return isInline ? (
                      <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">{children}</code>
                    ) : (
                      <pre className="bg-muted rounded-md p-3 overflow-x-auto text-xs font-mono mb-2">
                        <code className={className}>{children}</code>
                      </pre>
                    );
                  },
                  table: ({ children }) => <table className="w-full text-sm border-collapse mb-2">{children}</table>,
                  th: ({ children }) => <th className="border border-border bg-muted px-2 py-1 text-left font-medium">{children}</th>,
                  td: ({ children }) => <td className="border border-border px-2 py-1">{children}</td>,
                  a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-twitter-blue hover:underline">{children}</a>,
                  blockquote: ({ children }) => <blockquote className="border-l-2 border-twitter-blue pl-3 italic text-muted-foreground mb-2">{children}</blockquote>,
                }}
              >
                {editContent}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
