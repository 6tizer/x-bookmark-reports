/**
 * GET /api/bookmarks/[id]
 * CONTRACT v1.0 — reads from filesystem when DB is empty
 */

import { NextResponse } from "next/server";
import { isDbEmpty, getBookmarkDetailById } from "@/lib/db";
import { listDraftBookmarks } from "@/lib/fs-data";
import type { ApiResponse, BookmarkDetail, ExternalLink } from "@/types/api";

interface RouteParams {
  params: { id: string };
}

export async function GET(
  _request: Request,
  { params }: RouteParams
): Promise<NextResponse<ApiResponse<BookmarkDetail>>> {
  try {
    const { id } = params;

    if (isDbEmpty()) {
      // Find the draft by id (filename without .md)
      const allDrafts = listDraftBookmarks(1, 9999);
      const draft = allDrafts.items.find((d) => d.id === id || d.fileName === id + ".md");

      if (!draft) {
        return NextResponse.json(
          {
            success: false,
            data: null,
            error: { code: "NOT_FOUND", message: "Bookmark not found" },
          },
          { status: 404 }
        );
      }

      const rawLinks = draft.externalLinks || [];
      const externalLinks: ExternalLink[] = rawLinks.map((l) => ({
        url: l.url,
        title: l.title,
        description: l.description,
        category: "other",
      }));

      const detail: BookmarkDetail = {
        id: draft.id,
        url: draft.url,
        author: draft.author,
        text: draft.text,
        bookmarkedAt: draft.bookmarkedAt,
        syncBatchId: "fs_import",
        status: "synced",
        tags: draft.tags,
        urlCategory: "tweet",
        stats: draft.stats,
        fullText: draft.fullText || draft.body || draft.text,
        replies: [],
        externalLinks,
        reports: {},
      };

      return NextResponse.json({ success: true, data: detail });
    }

    const bookmark = getBookmarkDetailById(id);
    if (!bookmark) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: { code: "NOT_FOUND", message: "Bookmark not found" },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: bookmark });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: { code: "INTERNAL_ERROR", message, detail: String(err) },
      },
      { status: 500 }
    );
  }
}
