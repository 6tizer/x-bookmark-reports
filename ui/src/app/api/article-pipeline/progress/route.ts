/**
 * GET /api/article-pipeline/progress
 */

import { NextResponse } from "next/server";
import { getBatchProgress } from "@/lib/fs-data";
import type { ApiResponse, BatchProgress } from "@/types/api";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse<ApiResponse<BatchProgress>>> {
  try {
    const data = getBatchProgress();
    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        data: {
          isRunning: false,
          totalInBatch: 0,
          completed: 0,
          failed: 0,
          pending: 0,
          researching: 0,
          items: [],
        },
        error: { code: "INTERNAL_ERROR", message, detail: String(err) },
      },
      { status: 500 }
    );
  }
}
