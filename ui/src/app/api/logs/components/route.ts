/**
 * GET /api/logs/components
 * 返回 logs 表中所有 distinct component，供 Logs Viewer 过滤下拉用。
 * 真值化：直接从 DB 读取，无 mock fallback。
 */

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// 强制动态渲染，避免 Next.js 缓存该 endpoint
export const dynamic = "force-dynamic";

interface ComponentsResponse {
  components: string[];
}

export async function GET(): Promise<
  NextResponse<{
    success: boolean;
    data: ComponentsResponse | null;
    error?: { code: string; message: string; detail?: string };
  }>
> {
  try {
    const db = getDb();
    // 取 distinct component，按字母升序；过滤 NULL 防御脏数据
    const rows = db
      .prepare(
        `SELECT DISTINCT component FROM logs WHERE component IS NOT NULL ORDER BY component ASC`
      )
      .all() as Array<{ component: string }>;
    const components = rows.map((r) => r.component);
    return NextResponse.json({ success: true, data: { components } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        data: { components: [] },
        error: { code: "INTERNAL_ERROR", message, detail: String(err) },
      },
      { status: 500 }
    );
  }
}
