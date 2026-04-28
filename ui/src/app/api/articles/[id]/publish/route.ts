/**
 * POST /api/articles/[id]/publish
 * CONTRACT v1.0
 */

import { NextResponse } from "next/server";
import { isDbEmpty, publishArticle } from "@/lib/db";
import { getArticleById as getMockArticle, mockArticles } from "@/db/mock";
import { getLogger } from "@/lib/logger";
import type { ApiResponse, Article, PublishRequest } from "@/types/api";

interface RouteParams {
  params: { id: string };
}

const logger = getLogger("agent");

export async function POST(
  request: Request,
  { params }: RouteParams
): Promise<NextResponse<ApiResponse<Article>>> {
  try {
    const { id } = params;
    const body = (await request.json()) as PublishRequest;
    const format = body.format ?? "markdown";

    if (isDbEmpty()) {
      const mock = getMockArticle(id);
      if (!mock) {
        return NextResponse.json(
          {
            success: false,
            data: mockArticles[0],
            error: { code: "ARTICLE_NOT_FOUND", message: "Article not found in mock data" },
          },
          { status: 404 }
        );
      }
      return NextResponse.json({
        success: true,
        data: {
          ...mock,
          status: "published" as const,
          publishedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });
    }

    const article = publishArticle(id, format);
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

    logger.info(`Published article ${id} in ${format} format`);
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
