/**
 * GET /api/logs
 * CONTRACT v1.0 — DB logs + logs/bookmark-auto.log 合并（按时间倒序去重）
 *
 * 分页：从起点取 DB 窗口 + 文件日志合并后再 slice，保证跨页连续。
 * 超过窗口上限的深页回退为纯 DB 分页。
 */

import { NextResponse } from "next/server";
import { listLogs } from "@/lib/db";
import { mergeLogEntries, readBookmarkAutoLog } from "@/lib/log-reader";
import type { ApiResponse, LogEntry, PaginatedResponse, LogComponent, LogLevel } from "@/types/api";

/** 合并窗口上限：超出后深页走纯 DB，避免一次加载过大 */
const MERGE_WINDOW_MAX = 3000;

export async function GET(
  request: Request
): Promise<NextResponse<ApiResponse<PaginatedResponse<LogEntry>>>> {
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

    const offset = (page - 1) * limit;
    // 深页超出合并窗口：纯 DB，避免空页与内存暴涨
    if (offset >= MERGE_WINDOW_MAX) {
      const dbPage = listLogs(page, limit, component, level);
      return NextResponse.json({ success: true, data: dbPage });
    }

    const fileLogs = readBookmarkAutoLog(500);
    const fetchLimit = Math.min(
      Math.max(page * limit + fileLogs.length, 200),
      MERGE_WINDOW_MAX
    );
    const dbWindow = listLogs(1, fetchLimit, component, level);
    const merged = mergeLogEntries(dbWindow.items, fileLogs, component, level);
    const items = merged.slice(offset, offset + limit);

    // file-only：出现在合并结果但不在本次 DB 窗口键集合中的条目
    const dbKeys = new Set(dbWindow.items.map((e) => `${e.timestamp}|${e.message}`));
    let fileOnly = 0;
    for (const e of fileLogs) {
      if (component && e.component !== component) continue;
      if (level && e.level !== level) continue;
      if (!dbKeys.has(`${e.timestamp}|${e.message}`)) fileOnly++;
    }

    // total：DB 全量 + file-only 近似；hasMore 以合并流与 DB 是否还有更多为准
    const total = Math.max(dbWindow.total + fileOnly, merged.length);
    const hasMore =
      offset + items.length < merged.length ||
      dbWindow.hasMore ||
      fetchLimit < dbWindow.total;

    return NextResponse.json({
      success: true,
      data: {
        items,
        total,
        page,
        limit,
        hasMore,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        // 顶层 message：兼容 api.ts 非 2xx 读取 errBody.message
        message,
        data: { items: [], total: 0, page, limit, hasMore: false },
        error: { code: "INTERNAL_ERROR", message, detail: String(err) },
      },
      { status: 500 }
    );
  }
}
