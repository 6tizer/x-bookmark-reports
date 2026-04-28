/**
 * GET /api/reports/[id]/export
 * CONTRACT v1.0
 */

import { NextResponse } from "next/server";
import { isDbEmpty, getReportById } from "@/lib/db";
import { getReportById as getMockReport } from "@/db/mock";
import type { ApiResponse, Report } from "@/types/api";

interface RouteParams {
  params: { id: string };
}

export async function GET(
  request: Request,
  { params }: RouteParams
): Promise<NextResponse<ApiResponse<string>> | Response> {
  try {
    const { id } = params;
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") ?? "md";

    let report: Report | null;
    if (isDbEmpty()) {
      report = getMockReport(id) ?? null;
    } else {
      report = getReportById(id);
    }

    if (!report) {
      return NextResponse.json(
        {
          success: false,
          data: "",
          error: { code: "REPORT_NOT_FOUND", message: "Report not found" },
        },
        { status: 404 }
      );
    }

    if (format === "md") {
      return new Response(report.content, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="${report.id}.md"`,
        },
      });
    }

    // PDF not implemented — return markdown with warning header
    return new Response(report.content, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "X-Format-Unsupported": "PDF export not yet implemented, returning markdown",
        "Content-Disposition": `attachment; filename="${report.id}.md"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        data: "",
        error: { code: "INTERNAL_ERROR", message, detail: String(err) },
      },
      { status: 200 }
    );
  }
}
