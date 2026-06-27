/**
 * GET /api/bookmarks/[id]
 * CONTRACT v2 — uses getBookmarkByTweetId (bookmarks.json source of truth)
 *               supports pure tweet ID + legacy basename id (bookmark-deep-{tweetId}-{ts})
 */

import { NextResponse } from "next/server";
import { isDbEmpty, getBookmarkDetailById } from "@/lib/db";
import { getBookmarkByTweetId } from "@/lib/fs-data";
import type { ApiResponse, BookmarkDetail } from "@/types/api";

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
      // fs 分支：基于 bookmarks.json 真相源 + 三集合 join 的 V2 详情
      const v2 = getBookmarkByTweetId(id);
      if (!v2) {
        return NextResponse.json(
          {
            success: false,
            data: null,
            error: { code: "NOT_FOUND", message: "Bookmark not found" },
          },
          { status: 404 }
        );
      }

      const detail: BookmarkDetail = {
        id: v2.id,
        url: v2.url,
        author: v2.author,
        text: v2.text,
        bookmarkedAt: v2.bookmarkedAt,
        syncBatchId: "fs_import",
        status: "synced",
        tags: v2.tags,
        urlCategory: "tweet",
        stats: {
          likes: v2.stats.likes,
          replies: v2.stats.replies,
          bookmarks: v2.stats.bookmarks,
          views: v2.stats.views,
        },
        fullText: v2.fullText,
        replies: [],          // V2 暂无数据源，PR-2 接 Sync Terminal 时再补
        externalLinks: [],    // V2 暂无数据源，deepDraftBody 内已含外链
        reports: {},          // 旧 /reports 路由已废弃，留空
        // V2 扩展字段
        tweetId: v2.tweetId,
        lifecycle: v2.lifecycle,
        hasDeepDraft: v2.hasDeepDraft,
        hasArticle: v2.hasArticle,
        inNotion: v2.inNotion,
        articleTags: v2.tags,
        deepDraftPath: v2.deepDraftPath,
        articlePath: v2.articlePath,
        notionPageUrl: v2.notionPageUrl,
        deepDraftBody: v2.deepDraftBody,
      };

      return NextResponse.json({ success: true, data: detail });
    }

    // DB 分支：保留 V1 路径（暂未启用 DB 模式）
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
