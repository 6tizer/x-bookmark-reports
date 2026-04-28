/**
 * PUT /api/bookmarks/[id]/tags
 * CONTRACT v1.0
 */

import { NextResponse } from "next/server";
import { isDbEmpty, updateBookmarkTags } from "@/lib/db";
import { getLogger } from "@/lib/logger";
import type { ApiResponse } from "@/types/api";

interface RouteParams {
  params: { id: string };
}

const logger = getLogger("system");

export async function PUT(
  request: Request,
  { params }: RouteParams
): Promise<NextResponse<ApiResponse<{ id: string; tags: string[] }>>> {
  try {
    const { id } = params;
    const body = (await request.json()) as { tags?: string[] };

    if (!body.tags || !Array.isArray(body.tags)) {
      return NextResponse.json(
        {
          success: false,
          data: { id, tags: [] },
          error: { code: "INTERNAL_ERROR", message: "Missing tags array" },
        },
        { status: 400 }
      );
    }

    if (!isDbEmpty()) {
      const ok = updateBookmarkTags(id, body.tags);
      if (!ok) {
        return NextResponse.json(
          {
            success: false,
            data: { id, tags: body.tags },
            error: { code: "INTERNAL_ERROR", message: "Bookmark not found" },
          },
          { status: 404 }
        );
      }
    }

    logger.info(`Updated tags for bookmark ${id}: ${JSON.stringify(body.tags)}`);
    return NextResponse.json({ success: true, data: { id, tags: body.tags } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        data: { id: "", tags: [] },
        error: { code: "INTERNAL_ERROR", message, detail: String(err) },
      },
      { status: 200 }
    );
  }
}
