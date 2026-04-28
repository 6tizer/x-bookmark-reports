/**
 * POST /api/bookmarks/batch-read
 * CONTRACT v1.0
 */

import { NextResponse } from "next/server";
import { batchRead } from "@/lib/reader-service";
import type { ApiResponse, BatchReadRequest, BatchReadResponse } from "@/types/api";

export async function POST(
  request: Request
): Promise<NextResponse<ApiResponse<BatchReadResponse>>> {
  try {
    const body = (await request.json()) as BatchReadRequest;
    if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
      return NextResponse.json(
        {
          success: false,
          data: { jobId: "", status: "failed", total: 0, completed: 0, failed: 0 },
          error: { code: "INTERNAL_ERROR", message: "Missing or empty ids array" },
        },
        { status: 400 }
      );
    }

    const result = await batchRead(body.ids, body.type ?? "basic");
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        data: { jobId: "", status: "failed", total: 0, completed: 0, failed: 0 },
        error: { code: "READER_PYTHON_ERROR", message, detail: String(err) },
      },
      { status: 200 }
    );
  }
}
