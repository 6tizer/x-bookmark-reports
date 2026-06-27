/**
 * GET /api/bookmarks
 * CONTRACT v2.0 — fs 分支用 listAllBookmarks（bookmarks.json 真相源 + lifecycle join）
 */

import { NextResponse } from "next/server";
import { isDbEmpty, listBookmarks } from "@/lib/db";
import { listAllBookmarks } from "@/lib/fs-data";
import type {
  ApiResponse,
  Bookmark,
  BookmarkLifecycle,
  BookmarkV2,
  PaginatedResponse,
} from "@/types/api";

export async function GET(
  request: Request
): Promise<NextResponse<ApiResponse<PaginatedResponse<BookmarkV2>>>> {
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
    // Stage 2: lifecycle 过滤参数（仅 fs 分支生效；DB 分支忽略）
    const lifecycleParam = searchParams.get("lifecycle") as BookmarkLifecycle | null;

    if (isDbEmpty()) {
      // fs 分支：基于 bookmarks.json + 三集合 join 的 V2 视图
      const fsResult = listAllBookmarks(page, limit, search, lifecycleParam || undefined);

      // FsBookmarkV2 → BookmarkV2（旧 TweetStats 仅 4 字段，retweets/quotes 丢弃）
      const items: BookmarkV2[] = fsResult.items.map((b) => ({
        id: b.id,
        tweetId: b.tweetId,
        url: b.url,
        author: b.author,
        text: b.text,
        bookmarkedAt: b.bookmarkedAt,
        syncBatchId: "fs_import",
        status: "synced" as const,
        tags: b.tags,
        urlCategory: "tweet" as const,
        stats: {
          likes: b.stats.likes,
          replies: b.stats.replies,
          bookmarks: b.stats.bookmarks,
          views: b.stats.views,
        },
        lifecycle: b.lifecycle,
        hasDeepDraft: b.hasDeepDraft,
        hasArticle: b.hasArticle,
        inNotion: b.inNotion,
        articleTags: b.tags,
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

    // DB 分支：补 V2 字段（DB 模式不区分 lifecycle，统一回 drafted）
    const result = listBookmarks(page, limit, sort, search, status, tag, urlCategory, author);
    const itemsV2: BookmarkV2[] = result.items.map((b) => ({
      ...b,
      tweetId: b.id,
      lifecycle: "drafted" as const,
      hasDeepDraft: true,
      hasArticle: false,
      inNotion: false,
    }));
    return NextResponse.json({
      success: true,
      data: { ...result, items: itemsV2 },
    });
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
