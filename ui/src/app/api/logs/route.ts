/**
 * GET /api/logs
 * CONTRACT v1.0 — DB 真值化：直接读取 logs 表，不再 fallback mockLogs
 */

import { NextResponse } from "next/server";
import { listLogs } from "@/lib/db";
import type { ApiResponse, LogEntry, PaginatedResponse, LogComponent, LogLevel } from "@/types/api";

export async function GET(
  request: Request
): Promise<NextResponse<ApiResponse<PaginatedResponse<LogEntry>>>> {
  // 提到 try 外，便于 catch 块引用
  let page = 1;
  let limit = 50;
  try {
    const { searchParams } = new URL(request.url);
    page = Math.max(parseInt(searchParams.get("page") ?? "1", 10), 1);
    limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "50", 10), 1), 100);
    const component = (searchParams.get("component") as LogComponent) ?? undefined;
    const level = (searchParams.get("level") as LogLevel) ?? undefined;

    // 直接读 DB：DB 真为空时 listLogs 自然返回 items: [], total: 0
    const result = listLogs(page, limit, component, level);
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    // 兜底返回空数组，不再回退 mockLogs
    return NextResponse.json(
      {
        success: false,
        data: { items: [], total: 0, page, limit, hasMore: false },
        error: { code: "INTERNAL_ERROR", message, detail: String(err) },
      },
      { status: 200 }
    );
  }
}
