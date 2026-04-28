/**
 * POST /api/bookmarks/[id]/read-enhanced
 * CONTRACT v1.0
 */

import { NextResponse } from "next/server";
import { readBookmark } from "@/lib/reader-service";
import type { ApiResponse } from "@/types/api";

interface RouteParams {
  params: { id: string };
}

interface ReadResponse {
  jobId: string;
  status: "queued" | "running" | "completed" | "failed";
  bookmarkId: string;
}

export async function POST(
  request: Request,
  { params }: RouteParams
): Promise<NextResponse<ApiResponse<ReadResponse>>> {
  try {
    const { id } = params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const url = body.url ? String(body.url) : `https://x.com/status/${id}`;

    const result = await readBookmark(id, url, "enhanced");
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        data: { jobId: "", status: "failed", bookmarkId: "" },
        error: { code: "ENHANCED_READER_BROWSER_ERROR", message, detail: String(err) },
      },
      { status: 200 }
    );
  }
}
