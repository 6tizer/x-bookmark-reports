/**
 * GET /api/logs
 * CONTRACT v1.0 — DB logs + logs/bookmark-auto.log 合并（按时间倒序去重）
 *
 * 分页：始终从起点取 DB 窗口 + 文件日志合并后再 slice，保证跨页连续。
 * 不在窗口边界切换「纯 DB offset」（避免 file-only 插入导致 gap/dup）。
 */

import { NextResponse } from "next/server";
import { listLogs } from "@/lib/db";
import { mergeLogEntries, readBookmarkAutoLog } from "@/lib/log-reader";
import type { ApiResponse, LogEntry, PaginatedResponse, LogComponent, LogLevel } from "@/types/api";

/** 单次合并窗口上限（条）；超出时仍按合并序列 slice，只是截断远端 DB 拉取 */
const MERGE_WINDOW_MAX = 10000;

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
    const fileLogs = readBookmarkAutoLog(500);
    // 始终按「需要展示到的末行」拉 DB 窗口，再与 file 合并后 slice——无模式切换
    const fetchLimit = Math.min(
      Math.max(page * limit + fileLogs.length, 200),
      MERGE_WINDOW_MAX
    );
    const dbWindow = listLogs(1, fetchLimit, component, level);
    const merged = mergeLogEntries(dbWindow.items, fileLogs, component, level);
    const items = merged.slice(offset, offset + limit);

    const dbKeys = new Set(dbWindow.items.map((e) => `${e.timestamp}|${e.message}`));
    let fileOnly = 0;
    for (const e of fileLogs) {
      if (component && e.component !== component) continue;
      if (level && e.level !== level) continue;
      if (!dbKeys.has(`${e.timestamp}|${e.message}`)) fileOnly++;
    }

    const total = Math.max(dbWindow.total + fileOnly, merged.length);
    const hasMore =
      offset + items.length < merged.length ||
      fetchLimit < dbWindow.total ||
      dbWindow.hasMore;

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
        message,
        data: { items: [], total: 0, page, limit, hasMore: false },
        error: { code: "INTERNAL_ERROR", message, detail: String(err) },
      },
      { status: 500 }
    );
  }
}
