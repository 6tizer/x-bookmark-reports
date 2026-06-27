"use client";

/**
 * Bookmark detail page (V2)
 * - breadcrumb
 * - author header + 3 jump buttons (Open on X / 查看成品文章 / Notion 已上传)
 * - 主推文高亮卡片 + stats
 * - Tags（优先 articleTags）
 * - 深度报告全文（CollapsibleSection + ReactMarkdown）
 *
 * 删除旧的：Basic/Enhanced Report 跳转按钮（指向 /reports 僵尸路由）、
 *          External Links 区块、Replies 区块。
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ClientLayout } from "@/components/layout/ClientLayout";
import { getBookmarkByIdAPI } from "@/lib/api";
import { Skeleton } from "@/components/ui/Skeleton";
import type { BookmarkDetail } from "@/types/api";
import {
  Heart,
  MessageCircle,
  Bookmark as BookmarkIcon,
  Eye,
  ExternalLink,
  BookOpen,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function BookmarkDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [bookmark, setBookmark] = useState<BookmarkDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      setIsLoading(true);
      try {
        const data = await getBookmarkByIdAPI(id);
        setBookmark(data);
      } finally {
        setIsLoading(false);
      }
    };
    fetch();
  }, [id]);

  if (isLoading) {
    return (
      <ClientLayout>
        <div className="max-w-3xl space-y-4">
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </ClientLayout>
    );
  }

  if (!bookmark) {
    return (
      <ClientLayout>
        <div className="max-w-3xl text-center py-12">
          <p className="text-muted-foreground">Bookmark not found</p>
          <Link href="/bookmarks" className="text-twitter-blue hover:underline text-sm mt-2 inline-block">
            Back to bookmarks
          </Link>
        </div>
      </ClientLayout>
    );
  }

  const tags = bookmark.articleTags ?? bookmark.tags;

  return (
    <ClientLayout>
      <div className="max-w-3xl space-y-5">
        {/* 面包屑 */}
        <nav className="text-xs text-muted-foreground" aria-label="breadcrumb">
          <ol className="flex items-center gap-1 flex-wrap">
            <li>
              <Link href="/" className="hover:text-foreground transition-colors">
                Home
              </Link>
            </li>
            <li className="opacity-50">›</li>
            <li>
              <Link href="/bookmarks" className="hover:text-foreground transition-colors">
                Bookmarks
              </Link>
            </li>
            <li className="opacity-50">›</li>
            <li className="text-foreground font-medium truncate max-w-md">
              @{bookmark.author.handle} · {bookmark.fullText.slice(0, 40)}
              {bookmark.fullText.length > 40 ? "…" : ""}
            </li>
          </ol>
        </nav>

        {/* Author header + 顶部 3 跳转按钮 */}
        <div className="flex items-center gap-3">
          {bookmark.author.avatar ? (
            <img
              src={bookmark.author.avatar}
              alt={bookmark.author.name}
              className="h-12 w-12 rounded-full object-cover"
            />
          ) : (
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground">
              {bookmark.author.name[0]}
            </div>
          )}
          <div className="min-w-0">
            <p className="font-semibold text-foreground truncate">{bookmark.author.name}</p>
            <p className="text-sm text-muted-foreground truncate">{bookmark.author.handle}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <a
              href={bookmark.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted transition-colors"
            >
              <ExternalLink size={12} />
              Open on X
            </a>
            {bookmark.hasArticle && bookmark.tweetId && (
              <Link
                href={`/articles/${bookmark.tweetId}`}
                className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted transition-colors text-twitter-blue"
              >
                <BookOpen size={12} />
                查看成品文章
              </Link>
            )}
            {bookmark.inNotion && (
              <span
                className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-violet-600 dark:text-violet-400"
                title="Notion page URL 留 PR-3 接入"
              >
                <ExternalLink size={12} />
                Notion 已上传
              </span>
            )}
          </div>
        </div>

        {/* 主推文卡片 — 高亮 */}
        <div className="rounded-lg border-2 border-twitter-blue/30 bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 text-xs text-twitter-blue font-medium mb-2">
            <span className="rounded-full bg-twitter-blue/10 px-2 py-0.5">主推文</span>
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">
            {bookmark.fullText}
          </p>
          <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-0.5">
              <Heart size={12} /> {bookmark.stats.likes}
            </span>
            <span className="flex items-center gap-0.5">
              <MessageCircle size={12} /> {bookmark.stats.replies}
            </span>
            <span className="flex items-center gap-0.5">
              <BookmarkIcon size={12} /> {bookmark.stats.bookmarks}
            </span>
            <span className="flex items-center gap-0.5">
              <Eye size={12} /> {bookmark.stats.views}
            </span>
          </div>
        </div>

        {/* Tags（优先 articleTags） */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* 深度报告全文 — 可折叠 */}
        {bookmark.deepDraftBody && (
          <CollapsibleSection title="深度报告全文" defaultOpen={false}>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{bookmark.deepDraftBody}</ReactMarkdown>
            </div>
          </CollapsibleSection>
        )}
      </div>
    </ClientLayout>
  );
}

// 可折叠区块 helper
function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-foreground hover:bg-muted/50 transition-colors"
      >
        <span>{title}</span>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>
      {open && <div className="px-4 pb-4 pt-1">{children}</div>}
    </div>
  );
}
