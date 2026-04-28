/**
 * GET /api/sync/history
 * CONTRACT v1.0 — returns empty when no DB data (filesystem mode)
 */

import { NextResponse } from "next/server";
import { isDbEmpty, listSyncJobs } from "@/lib/db";
import type { ApiResponse, SyncJob, PaginatedResponse } from "@/types/api";

export async function GET(
  request: Request
): Promise<NextResponse<ApiResponse<PaginatedResponse<SyncJob>>>> {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(parseInt(searchParams.get("page") ?? "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "20", 10), 1), 100);

    if (isDbEmpty()) {
      // No sync history in filesystem mode — return empty
      return NextResponse.json({
        success: true,
        data: {
          items: [],
          total: 0,
          page,
          limit,
          hasMore: false,
        },
      });
    }

    const result = listSyncJobs(page, limit);
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
