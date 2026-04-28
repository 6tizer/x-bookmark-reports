/**
 * PUT /api/bookmarks/[id]/status
 * CONTRACT v1.0
 */

import { NextResponse } from "next/server";
import { isDbEmpty, updateBookmarkStatus } from "@/lib/db";
import { getLogger } from "@/lib/logger";
import type { ApiResponse, BookmarkStatus } from "@/types/api";

interface RouteParams {
  params: { id: string };
}

const logger = getLogger("system");

export async function PUT(
  request: Request,
  { params }: RouteParams
): Promise<NextResponse<ApiResponse<{ id: string; status: BookmarkStatus }>>> {
  try {
    const { id } = params;
    const body = (await request.json()) as { status?: BookmarkStatus };

    if (!body.status) {
      return NextResponse.json(
        {
          success: false,
          data: { id, status: "synced" },
          error: { code: "INTERNAL_ERROR", message: "Missing status field" },
        },
        { status: 400 }
      );
    }

    const validStatuses: BookmarkStatus[] = ["synced", "read", "reported", "articled"];
    if (!validStatuses.includes(body.status)) {
      return NextResponse.json(
        {
          success: false,
          data: { id, status: body.status },
          error: { code: "INTERNAL_ERROR", message: `Invalid status: ${body.status}` },
        },
        { status: 400 }
      );
    }

    if (!isDbEmpty()) {
      const ok = updateBookmarkStatus(id, body.status);
      if (!ok) {
        return NextResponse.json(
          {
            success: false,
            data: { id, status: body.status },
            error: { code: "INTERNAL_ERROR", message: "Bookmark not found" },
          },
          { status: 404 }
        );
      }
    }

    logger.info(`Updated status for bookmark ${id}: ${body.status}`);
    return NextResponse.json({ success: true, data: { id, status: body.status } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        data: { id: "", status: "synced" },
        error: { code: "INTERNAL_ERROR", message, detail: String(err) },
      },
      { status: 200 }
    );
  }
}
