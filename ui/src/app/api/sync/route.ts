/**
 * POST /api/sync
 * CONTRACT v1.0
 */

import { NextResponse } from "next/server";
import { startSync } from "@/lib/sync-service";
import type { ApiResponse, SyncStartRequest, SyncStartResponse } from "@/types/api";

export async function POST(
  request: Request
): Promise<NextResponse<ApiResponse<SyncStartResponse>>> {
  try {
    const body = (await request.json()) as SyncStartRequest;
    const mode = body.mode ?? "incremental";

    if (mode !== "incremental" && mode !== "full") {
      return NextResponse.json(
        {
          success: false,
          data: { jobId: "", status: "failed", mode: "incremental", startedAt: "" },
          error: { code: "SYNC_INVALID_MODE", message: `Invalid sync mode: ${mode}` },
        },
        { status: 400 }
      );
    }

    const result = await startSync(mode);
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        data: { jobId: "", status: "failed", mode: "incremental", startedAt: "" },
        error: { code: "SYNC_RETTIWT_ERROR", message, detail: String(err) },
      },
      { status: 200 }
    );
  }
}
