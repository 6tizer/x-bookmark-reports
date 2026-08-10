/**
 * GET /api/logs
 * CONTRACT v1.0 — DB logs + logs/bookmark-auto.log 合并（按时间倒序去重）
 */

import { NextResponse } from "next/server";
import { listLogs } from "@/lib/db";
import { mergeLogEntries, readBookmarkAutoLog } from "@/lib/log-reader";
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

    // 多取一些 DB 行，便于与文件日志合并后再分页
    const fetchLimit = Math.min(500, Math.max(limit * page, 200));
    const dbResult = listLogs(1, fetchLimit, component, level);
    const fileLogs = readBookmarkAutoLog(500);
    const merged = mergeLogEntries(dbResult.items, fileLogs, component, level);

    const total = merged.length;
    const offset = (page - 1) * limit;
    const items = merged.slice(offset, offset + limit);

    return NextResponse.json({
      success: true,
      data: {
        items,
        total,
        page,
        limit,
        hasMore: page * limit < total,
      },
    });
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
