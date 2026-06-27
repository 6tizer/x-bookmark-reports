/**
 * GET /api/dashboard/activity
 * CONTRACT v1.0 — 合并 DB activities 与 fs 派生事件，按时间倒序取最新
 * 修复：仅有旧 DB 模拟数据时仍显示 fs 中较新的 auto_run / coordinator 事件
 */

import { NextResponse } from "next/server";
import { listActivities, hasDbActivities } from "@/lib/db";
import { listFsActivities } from "@/lib/fs-data";
import type { ApiResponse, ActivityItem } from "@/types/api";

interface ActivityResponse {
  items: ActivityItem[];
  total: number;
}

/** 合并两路活动并按 timestamp 去重、倒序 */
function mergeActivities(dbItems: ActivityItem[], fsItems: ActivityItem[], limit: number): ActivityResponse {
  const seen = new Set<string>();
  const merged: ActivityItem[] = [];

  for (const item of [...dbItems, ...fsItems].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )) {
    const key = `${item.type}|${item.timestamp}|${item.message?.slice(0, 48) ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
    if (merged.length >= limit) break;
  }

  return { items: merged, total: merged.length };
}

export async function GET(
  request: Request
): Promise<NextResponse<ApiResponse<ActivityResponse>>> {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);

    const dbResult = hasDbActivities() ? listActivities(limit * 2) : { items: [], total: 0 };
    const fsResult = listFsActivities(limit * 2);
    const result = mergeActivities(dbResult.items, fsResult.items, limit);

    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        data: { items: [], total: 0 },
        error: { code: "INTERNAL_ERROR", message, detail: String(err) },
      },
      { status: 500 }
    );
  }
}
