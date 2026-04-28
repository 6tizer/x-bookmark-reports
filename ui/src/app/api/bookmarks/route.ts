/**
 * GET /api/bookmarks
 * CONTRACT v1.0 — reads from filesystem when DB is empty
 */

import { NextResponse } from "next/server";
import { isDbEmpty, listBookmarks } from "@/lib/db";
import { listDraftBookmarks } from "@/lib/fs-data";
import type { ApiResponse, Bookmark, PaginatedResponse } from "@/types/api";

export async function GET(
  request: Request
): Promise<NextResponse<ApiResponse<PaginatedResponse<Bookmark>>>> {
  try {
    const { searchParams } = new URL(request.url);

    const page = Math.max(parseInt(searchParams.get("page") ?? "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "20", 10), 1), 100);
    const sort = searchParams.get("sort") ?? "bookmarkedAt:desc";
    const search = searchParams.get("search") ?? undefined;
    const status = (searchParams.get("status") as Bookmark["status"]) ?? undefined;
    const tag = searchParams.get("tag") ?? undefined;
    const urlCategory = (searchParams.get("urlCategory") as Bookmark["urlCategory"]) ?? undefined;
    const author = searchParams.get("author") ?? undefined;

    if (isDbEmpty()) {
      // Read from filesystem — real draft data in output/ directory
      const fsResult = listDraftBookmarks(page, limit, search, status);

      // Map FsBookmark to Bookmark type
      const items: Bookmark[] = fsResult.items.map((d) => ({
        id: d.id,
        url: d.url,
        author: d.author,
        text: d.text,
        bookmarkedAt: d.bookmarkedAt,
        syncBatchId: "fs_import",
        status: "synced" as const,
        tags: d.tags,
        urlCategory: "tweet" as const,
        stats: d.stats,
      }));

      return NextResponse.json({
        success: true,
        data: {
          items,
          total: fsResult.total,
          page,
          limit,
          hasMore: fsResult.hasMore,
        },
      });
    }

    const result = listBookmarks(page, limit, sort, search, status, tag, urlCategory, author);
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        data: { items: [], total: 0, page: 1, limit: 20, hasMore: false },
        error: { code: "INTERNAL_ERROR", message, detail: String(err) },
      },
      { status: 500 }
    );
  }
}
