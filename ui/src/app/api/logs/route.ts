/**
 * GET /api/logs
 * CONTRACT v1.0
 */

import { NextResponse } from "next/server";
import { isDbEmpty, listLogs } from "@/lib/db";
import { mockLogs } from "@/db/mock";
import type { ApiResponse, LogEntry, PaginatedResponse, LogComponent, LogLevel } from "@/types/api";

export async function GET(
  request: Request
): Promise<NextResponse<ApiResponse<PaginatedResponse<LogEntry>>>> {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(parseInt(searchParams.get("page") ?? "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "50", 10), 1), 100);
    const component = (searchParams.get("component") as LogComponent) ?? undefined;
    const level = (searchParams.get("level") as LogLevel) ?? undefined;

    if (isDbEmpty()) {
      let filtered = [...mockLogs];
      if (component) filtered = filtered.filter((l) => l.component === component);
      if (level) filtered = filtered.filter((l) => l.level === level);

      const offset = (page - 1) * limit;
      const items = filtered.slice(offset, offset + limit);
      return NextResponse.json({
        success: true,
        data: {
          items,
          total: filtered.length,
          page,
          limit,
          hasMore: page * limit < filtered.length,
        },
      });
    }

    const result = listLogs(page, limit, component, level);
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        data: { items: mockLogs.slice(0, 50), total: mockLogs.length, page: 1, limit: 50, hasMore: false },
        error: { code: "INTERNAL_ERROR", message, detail: String(err) },
      },
      { status: 200 }
    );
  }
}
