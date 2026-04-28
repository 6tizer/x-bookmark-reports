/**
 * GET /api/sync/[jobId]
 * CONTRACT v1.0
 */

import { NextResponse } from "next/server";
import { isDbEmpty, getSyncJobById } from "@/lib/db";
import { getSyncJobById as getMockSyncJob } from "@/db/mock";
import type { ApiResponse, SyncJob } from "@/types/api";

interface RouteParams {
  params: { jobId: string };
}

export async function GET(
  _request: Request,
  { params }: RouteParams
): Promise<NextResponse<ApiResponse<SyncJob>>> {
  try {
    const { jobId } = params;

    if (isDbEmpty()) {
      const mock = getMockSyncJob(jobId);
      if (mock) {
        return NextResponse.json({ success: true, data: mock });
      }
      return NextResponse.json(
        {
          success: false,
          data: getMockSyncJob("sync_005")!,
          error: { code: "INTERNAL_ERROR", message: "Sync job not found in mock data" },
        },
        { status: 404 }
      );
    }

    const job = getSyncJobById(jobId);
    if (!job) {
      return NextResponse.json(
        {
          success: false,
          data: getMockSyncJob("sync_005")!,
          error: { code: "INTERNAL_ERROR", message: "Sync job not found" },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: job });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        data: getMockSyncJob("sync_005")!,
        error: { code: "INTERNAL_ERROR", message, detail: String(err) },
      },
      { status: 200 }
    );
  }
}
