/**
 * GET /api/dashboard/activity
 * CONTRACT v1.0 — DB 真值化：直接读取 activities 表
 * Stage 4 — fs 兜底：DB 无 activities 时从 4 个 state 文件派生事件，解决 B-ACT-001
 */

import { NextResponse } from "next/server";
import { listActivities, hasDbActivities } from "@/lib/db";
import { listFsActivities } from "@/lib/fs-data";
import type { ApiResponse, ActivityItem } from "@/types/api";

interface ActivityResponse {
  items: ActivityItem[];
  total: number;
}

export async function GET(
  request: Request
): Promise<NextResponse<ApiResponse<ActivityResponse>>> {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);

    // Stage 4：DB 真值优先，fs 派生兜底
    // - hasDbActivities()=true → 读 activities 表（DB 真值模式）
    // - hasDbActivities()=false → 从 4 个 state 文件派生事件（fs 模式，B-ACT-001）
    if (hasDbActivities()) {
      const result = listActivities(limit);
      return NextResponse.json({ success: true, data: result });
    }
    const fsResult = listFsActivities(limit);
    return NextResponse.json({ success: true, data: fsResult });
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
