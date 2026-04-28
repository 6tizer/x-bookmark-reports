/**
 * GET /api/reports
 * CONTRACT v1.0 — reads from filesystem when DB is empty
 */

import { NextResponse } from "next/server";
import { isDbEmpty, listReports } from "@/lib/db";
import { listArticles as listFsArticles } from "@/lib/fs-data";
import type { ApiResponse, Report, PaginatedResponse } from "@/types/api";

export async function GET(
  request: Request
): Promise<NextResponse<ApiResponse<PaginatedResponse<Report>>>> {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(parseInt(searchParams.get("page") ?? "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "20", 10), 1), 100);
    const type = searchParams.get("type") ?? undefined;
    const search = searchParams.get("search") ?? undefined;

    if (isDbEmpty()) {
      // Use articles as "reports" — they are the final output of the pipeline
      const fsResult = listFsArticles(page, limit);

      const items: Report[] = fsResult.items.map((a) => {
        // Extract first line or filename as title
        const firstLine = a.content.split("\n").find((l) => l.startsWith("# "));
        const title = firstLine
          ? firstLine.replace(/^#+\s*/, "")
          : a.title;

        return {
          id: a.id,
          bookmarkId: a.id,
          type: (type as Report["type"]) ?? "basic",
          title,
          content: a.content.slice(0, 500) + "...",
          generatedAt: a.publishedAt,
          wordCount: a.wordCount,
          urlSummary: [],
        };
      });

      // Filter
      let filtered = items;
      if (search) {
        const s = search.toLowerCase();
        filtered = filtered.filter(
          (r) => r.title.toLowerCase().includes(s) || r.content.toLowerCase().includes(s)
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

    const result = listReports(page, limit, undefined, undefined, type, search);
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
