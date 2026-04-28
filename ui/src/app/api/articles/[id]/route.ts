/**
 * GET + PUT /api/articles/[id]
 * CONTRACT v1.0
 */

import { NextResponse } from "next/server";
import { isDbEmpty, getArticleById, updateArticle, createArticleVersion } from "@/lib/db";
import { getArticleById as getMockArticle, mockArticles } from "@/db/mock";
import { getLogger } from "@/lib/logger";
import type { ApiResponse, Article, UpdateArticleRequest } from "@/types/api";

interface RouteParams {
  params: { id: string };
}

const logger = getLogger("agent");

// ── GET ─────────────────────────────────────
export async function GET(
  _request: Request,
  { params }: RouteParams
): Promise<NextResponse<ApiResponse<Article>>> {
  try {
    const { id } = params;

    if (isDbEmpty()) {
      const mock = getMockArticle(id);
      if (mock) return NextResponse.json({ success: true, data: mock });
      return NextResponse.json(
        {
          success: false,
          data: mockArticles[0],
          error: { code: "ARTICLE_NOT_FOUND", message: "Article not found in mock data" },
        },
        { status: 404 }
      );
    }

    const article = getArticleById(id);
    if (!article) {
      return NextResponse.json(
        {
          success: false,
          data: mockArticles[0],
          error: { code: "ARTICLE_NOT_FOUND", message: "Article not found" },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: article });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        data: mockArticles[0],
        error: { code: "INTERNAL_ERROR", message, detail: String(err) },
      },
      { status: 200 }
    );
  }
}

// ── PUT ─────────────────────────────────────
export async function PUT(
  request: Request,
  { params }: RouteParams
): Promise<NextResponse<ApiResponse<Article>>> {
  try {
    const { id } = params;
    const body = (await request.json()) as UpdateArticleRequest;

    if (isDbEmpty()) {
      const mock = getMockArticle(id);
      return NextResponse.json({
        success: true,
        data: {
          ...mock!,
          title: body.title ?? mock!.title,
          content: body.content ?? mock!.content,
          status: body.status ?? mock!.status,
          tags: body.tags ?? mock!.tags,
          updatedAt: new Date().toISOString(),
        },
      });
    }

    const existing = getArticleById(id);
    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          data: mockArticles[0],
          error: { code: "ARTICLE_NOT_FOUND", message: "Article not found" },
        },
        { status: 404 }
      );
    }

    // Save version if content changed
    if (body.content && body.content !== existing.content) {
      createArticleVersion(id, body.title ?? existing.title, existing.content, "user");
    }

    const ok = updateArticle(id, body);
    if (!ok) {
      return NextResponse.json(
        {
          success: false,
          data: mockArticles[0],
          error: { code: "INTERNAL_ERROR", message: "Update failed" },
        },
        { status: 200 }
      );
    }

    const updated = getArticleById(id)!;
    logger.info(`Updated article ${id}`);
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        data: mockArticles[0],
        error: { code: "INTERNAL_ERROR", message, detail: String(err) },
      },
      { status: 200 }
    );
  }
}
