/**
 * GET /api/dashboard/activity
 * CONTRACT v1.0 — returns empty when no DB data (filesystem mode)
 */

import { NextResponse } from "next/server";
import { isDbEmpty, listActivities } from "@/lib/db";
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

    if (isDbEmpty()) {
      // No activity log in filesystem mode
      return NextResponse.json({
        success: true,
        data: { items: [], total: 0 },
      });
    }

    const result = listActivities(limit);
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
