"use client";

/**
 * Bookmark detail page — full text, reports, replies, external links
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ClientLayout } from "@/components/layout/ClientLayout";
import { getBookmarkByIdAPI, startRead } from "@/lib/api";
import { Skeleton } from "@/components/ui/Skeleton";
import type { BookmarkDetail } from "@/types/api";
import {
  ArrowLeft,
  Heart,
  MessageCircle,
  Bookmark as BookmarkIcon,
  Eye,
  ExternalLink,
  BookOpen,
  Sparkles,
  FileText,
} from "lucide-react";

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
          <Skeleton className="h-8 w-40" />
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

  return (
    <ClientLayout>
      <div className="max-w-3xl space-y-6">
        {/* Back link */}
        <Link
          href="/bookmarks"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={14} />
          Back to bookmarks
        </Link>

        {/* Author header */}
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
          <div>
            <p className="font-semibold text-foreground">{bookmark.author.name}</p>
            <p className="text-sm text-muted-foreground">{bookmark.author.handle}</p>
          </div>
          <a
            href={bookmark.url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted transition-colors"
          >
            <ExternalLink size={12} />
            Open on X
          </a>
        </div>

        {/* Full text */}
        <div className="rounded-lg border border-border bg-card p-5">
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">
            {bookmark.fullText}
          </p>
          <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-0.5"><Heart size={12} /> {bookmark.stats.likes}</span>
            <span className="flex items-center gap-0.5"><MessageCircle size={12} /> {bookmark.stats.replies}</span>
            <span className="flex items-center gap-0.5"><BookmarkIcon size={12} /> {bookmark.stats.bookmarks}</span>
            <span className="flex items-center gap-0.5"><Eye size={12} /> {bookmark.stats.views}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => startRead(bookmark.id, false)}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
          >
            <BookOpen size={14} /> Read
          </button>
          <button
            onClick={() => startRead(bookmark.id, true)}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
          >
            <Sparkles size={14} /> Enhanced Read
          </button>
          {bookmark.reports.basic && (
            <Link
              href={`/reports/${bookmark.reports.basic.id}`}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
            >
              <FileText size={14} /> Basic Report
            </Link>
          )}
          {bookmark.reports.enhanced && (
            <Link
              href={`/reports/${bookmark.reports.enhanced.id}`}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
            >
              <FileText size={14} /> Enhanced Report
            </Link>
          )}
        </div>

        {/* Tags */}
        {bookmark.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {bookmark.tags.map((tag) => (
              <span key={tag} className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* External Links */}
        {bookmark.externalLinks.length > 0 && (
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground mb-2">External Links</h3>
            <ul className="space-y-2">
              {bookmark.externalLinks.map((link) => (
                <li key={link.url}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-2 text-sm text-twitter-blue hover:underline"
                  >
                    <ExternalLink size={12} className="opacity-50 group-hover:opacity-100" />
                    {link.title}
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {link.category}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Replies */}
        {bookmark.replies.length > 0 && (
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Replies ({bookmark.replies.length})</h3>
            <div className="space-y-3">
              {bookmark.replies.map((reply) => (
                <div key={reply.id} className="border-l-2 border-border pl-3 py-1">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium">{reply.author.name}</p>
                    <p className="text-[10px] text-muted-foreground">{reply.author.handle}</p>
                  </div>
                  <p className="text-sm text-foreground mt-0.5">{reply.text}</p>
                  <div className="mt-1 flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-0.5"><Heart size={10} /> {reply.stats.likes}</span>
                    <span className="flex items-center gap-0.5"><MessageCircle size={10} /> {reply.stats.replies}</span>
                    <span>{new Date(reply.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ClientLayout>
  );
}
