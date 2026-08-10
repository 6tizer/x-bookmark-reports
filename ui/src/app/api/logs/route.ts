/**
 * GET /api/logs
 * CONTRACT v1.0 — DB logs + logs/bookmark-auto.log 合并（按时间倒序去重）
 *
 * 分页策略：
 * - page===1：合并 DB 最近条目 + bookmark-auto.log（auto_run 近况）
 * - page>1：仅 DB 分页（文件日志只覆盖近期，避免深页空窗/total 失真）
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
    const pageRaw = parseInt(searchParams.get("page") ?? "1", 10);
    const limitRaw = parseInt(searchParams.get("limit") ?? "50", 10);
    page = Number.isFinite(pageRaw) ? Math.max(pageRaw, 1) : 1;
    limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;
    const component = (searchParams.get("component") as LogComponent) ?? undefined;
    const level = (searchParams.get("level") as LogLevel) ?? undefined;

    if (page > 1) {
      // 深页：纯 DB，保证 offset/total/hasMore 一致
      const dbPage = listLogs(page, limit, component, level);
      return NextResponse.json({ success: true, data: dbPage });
    }

    // 首页：合并文件日志与 DB 最近条目
    const dbRecent = listLogs(1, Math.max(limit, 200), component, level);
    const fileLogs = readBookmarkAutoLog(500);
    const merged = mergeLogEntries(dbRecent.items, fileLogs, component, level);
    const items = merged.slice(0, limit);

    // total ≈ DB 总数 + 仅存在于文件侧的增量（近似，供 UI 翻页）
    const dbKeys = new Set(dbRecent.items.map((e) => `${e.timestamp}|${e.message}`));
    let fileOnly = 0;
    for (const e of fileLogs) {
      if (component && e.component !== component) continue;
      if (level && e.level !== level) continue;
      if (!dbKeys.has(`${e.timestamp}|${e.message}`)) fileOnly++;
    }
    const total = Math.max(dbRecent.total + fileOnly, merged.length);

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
    return NextResponse.json(
      {
        success: false,
        data: { items: [], total: 0, page, limit, hasMore: false },
        error: { code: "INTERNAL_ERROR", message, detail: String(err) },
      },
      { status: 500 }
    );
  }
}
