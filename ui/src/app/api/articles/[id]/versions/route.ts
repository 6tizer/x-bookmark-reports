/**
 * GET /api/articles/[id]/versions
 * CONTRACT v1.0
 */

import { NextResponse } from "next/server";
import { isDbEmpty, getArticleVersions } from "@/lib/db";
import { mockArticleVersions } from "@/db/mock";
import type { ApiResponse, ArticleVersion } from "@/types/api";

interface RouteParams {
  params: { id: string };
}

export async function GET(
  _request: Request,
  { params }: RouteParams
): Promise<NextResponse<ApiResponse<ArticleVersion[]>>> {
  try {
    const { id } = params;

    if (isDbEmpty()) {
      const versions = mockArticleVersions.filter((v) => v.articleId === id);
      return NextResponse.json({ success: true, data: versions });
    }

    const versions = getArticleVersions(id);
    return NextResponse.json({ success: true, data: versions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        data: [],
        error: { code: "INTERNAL_ERROR", message, detail: String(err) },
      },
      { status: 200 }
    );
  }
}
