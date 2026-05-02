/**
 * GET + PUT /api/reports/[id]
 * CONTRACT v1.0
 */

import { NextResponse } from "next/server";
import { isDbEmpty, getReportById, updateReportContent } from "@/lib/db";
import { getArticleById as getFsArticleById } from "@/lib/fs-data";
import { getReportById as getMockReport, mockReports } from "@/db/mock";
import { getLogger } from "@/lib/logger";
import type { ApiResponse, Report, UpdateReportRequest } from "@/types/api";

interface RouteParams {
  params: { id: string };
}

const logger = getLogger("system");

function fsArticleToReport(a: NonNullable<ReturnType<typeof getFsArticleById>>): Report {
  return {
    id: a.id,
    bookmarkId: a.id,
    type: "basic",
    title: a.title,
    content: a.content,
    generatedAt: a.publishedAt,
    wordCount: a.wordCount,
    urlSummary: [],
  };
}

// ── GET ─────────────────────────────────────
export async function GET(
  _request: Request,
  { params }: RouteParams
): Promise<NextResponse<ApiResponse<Report>>> {
  try {
    const rawId = params.id;
    let id = rawId;
    try {
      id = decodeURIComponent(rawId);
    } catch {
      id = rawId;
    }

    if (isDbEmpty()) {
      const fsArt = getFsArticleById(id);
      if (fsArt) return NextResponse.json({ success: true, data: fsArticleToReport(fsArt) });
      const mock = getMockReport(id);
      if (mock) return NextResponse.json({ success: true, data: mock });
      return NextResponse.json(
        {
          success: false,
          data: mockReports[0],
          error: { code: "REPORT_NOT_FOUND", message: "Report not found" },
        },
        { status: 404 }
      );
    }

    const report = getReportById(id);
    if (!report) {
      return NextResponse.json(
        {
          success: false,
          data: mockReports[0],
          error: { code: "REPORT_NOT_FOUND", message: "Report not found" },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: report });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        data: mockReports[0],
        error: { code: "INTERNAL_ERROR", message, detail: String(err) },
      },
      { status: 200 }
    );
  }
}

// ── PUT ─────────────────────────────────────
export async function PUT(
  request: Request,
  { params }: RouteParams
): Promise<NextResponse<ApiResponse<{ id: string; version: number; updatedAt: string }>>> {
  try {
    const { id } = params;
    const body = (await request.json()) as UpdateReportRequest;

    if (!body.content) {
      return NextResponse.json(
        {
          success: false,
          data: { id, version: 0, updatedAt: "" },
          error: { code: "REPORT_SAVE_ERROR", message: "Missing content" },
        },
        { status: 400 }
      );
    }

    if (isDbEmpty()) {
      return NextResponse.json({
        success: true,
        data: { id, version: 1, updatedAt: new Date().toISOString() },
      });
    }

    const result = updateReportContent(id, body.content, body.saveMode ?? "overwrite");
    if (!result) {
      return NextResponse.json(
        {
          success: false,
          data: { id, version: 0, updatedAt: "" },
          error: { code: "REPORT_NOT_FOUND", message: "Report not found" },
        },
        { status: 404 }
      );
    }

    logger.info(`Updated report ${id}, mode=${body.saveMode ?? "overwrite"}`);
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        data: { id: "", version: 0, updatedAt: "" },
        error: { code: "REPORT_SAVE_ERROR", message, detail: String(err) },
      },
      { status: 200 }
    );
  }
}
