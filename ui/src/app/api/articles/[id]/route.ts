/**
 * GET + PUT /api/articles/[id]
 * CONTRACT v1.0
 */

import { NextResponse } from "next/server";
import { isDbEmpty, getArticleById, updateArticle, createArticleVersion } from "@/lib/db";
import { getArticleById as getFsArticleById } from "@/lib/fs-data";
import { getArticleById as getMockArticle, mockArticles } from "@/db/mock";
import { getLogger } from "@/lib/logger";
import type { ApiResponse, Article, UpdateArticleRequest } from "@/types/api";

interface RouteParams {
  params: { id: string };
}

const logger = getLogger("agent");

function fsArticleToApi(a: NonNullable<ReturnType<typeof getFsArticleById>>): Article {
  return {
    id: a.id,
    title: a.title,
    content: a.content,
    status: a.status,
    createdAt: a.publishedAt,
    updatedAt: a.publishedAt,
    publishedAt: a.status === "published" ? a.publishedAt : undefined,
    tags: [],
    wordCount: a.wordCount,
  };
}

// ── GET ─────────────────────────────────────
export async function GET(
  _request: Request,
  { params }: RouteParams
): Promise<NextResponse<ApiResponse<Article>>> {
  try {
    const { id } = params;

    if (isDbEmpty()) {
      const fsArt = getFsArticleById(id);
      if (fsArt) return NextResponse.json({ success: true, data: fsArticleToApi(fsArt) });
      const mock = getMockArticle(id);
      if (mock) return NextResponse.json({ success: true, data: mock });
      return NextResponse.json(
        {
          success: false,
          data: mockArticles[0],
          error: { code: "ARTICLE_NOT_FOUND", message: "Article not found" },
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
      const fsArt = getFsArticleById(id);
      if (fsArt) {
        const content = body.content ?? fsArt.content;
        const nextStatus =
          body.status === "draft" || body.status === "published"
            ? body.status
            : fsArt.status;
        const merged: typeof fsArt = {
          ...fsArt,
          title: body.title ?? fsArt.title,
          content,
          status: nextStatus,
          wordCount: content.split(/\s+/).filter(Boolean).length,
        };
        return NextResponse.json({
          success: true,
          data: fsArticleToApi(merged),
        });
      }
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
