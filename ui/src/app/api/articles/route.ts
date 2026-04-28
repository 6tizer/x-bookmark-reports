/**
 * GET + POST /api/articles
 * CONTRACT v1.0 — reads from filesystem when DB is empty
 */

import { NextResponse } from "next/server";
import { isDbEmpty, listArticles, createArticle } from "@/lib/db";
import { listArticles as listFsArticles } from "@/lib/fs-data";
import { getLogger } from "@/lib/logger";
import type { ApiResponse, Article, CreateArticleRequest, PaginatedResponse } from "@/types/api";

const logger = getLogger("agent");

// ── GET ─────────────────────────────────────
export async function GET(
  request: Request
): Promise<NextResponse<ApiResponse<PaginatedResponse<Article>>>> {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(parseInt(searchParams.get("page") ?? "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "20", 10), 1), 100);
    const status = (searchParams.get("status") as Article["status"]) ?? undefined;
    const search = searchParams.get("search") ?? undefined;

    if (isDbEmpty()) {
      const fsResult = listFsArticles(page, limit, status);

      const items: Article[] = fsResult.items.map((a) => {
        const firstLine = a.content.split("\n").find((l) => l.startsWith("# "));
        const title = firstLine
          ? firstLine.replace(/^#+\s*/, "")
          : a.title;

        return {
          id: a.id,
          title,
          content: a.content,
          status: "published" as const,
          createdAt: a.publishedAt,
          updatedAt: a.publishedAt,
          publishedAt: a.publishedAt,
          tags: [],
          wordCount: a.wordCount,
        };
      });

      // Search filter
      let filtered = items;
      if (search) {
        const s = search.toLowerCase();
        filtered = filtered.filter(
          (a) => a.title.toLowerCase().includes(s) || a.content.toLowerCase().includes(s)
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          items: filtered,
          total: fsResult.total,
          page,
          limit,
          hasMore: fsResult.hasMore,
        },
      });
    }

    const result = listArticles(page, limit, status, search);
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

// ── POST ────────────────────────────────────
export async function POST(
  request: Request
): Promise<NextResponse<ApiResponse<Article>>> {
  try {
    const body = (await request.json()) as CreateArticleRequest;

    if (!body.title) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: { code: "BAD_REQUEST", message: "Missing title" },
        },
        { status: 400 }
      );
    }

    if (isDbEmpty()) {
      // Read-only mode from filesystem — just echo back
      return NextResponse.json({
        success: true,
        data: {
          id: `art_${Date.now()}`,
          reportId: body.reportId,
          title: body.title,
          content: "",
          status: "draft",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tags: [],
          wordCount: 0,
        },
      });
    }

    const article = createArticle(body.reportId, body.title);
    logger.info(`Created article ${article.id} from report ${body.reportId ?? "none"}`);
    return NextResponse.json({ success: true, data: article });
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
