/**
 * GET /api/reports/[id]/versions
 * CONTRACT v1.0
 */

import { NextResponse } from "next/server";
import { isDbEmpty, getReportVersions } from "@/lib/db";
import { mockReportVersions } from "@/db/mock";
import type { ApiResponse, ReportVersion } from "@/types/api";

interface RouteParams {
  params: { id: string };
}

export async function GET(
  _request: Request,
  { params }: RouteParams
): Promise<NextResponse<ApiResponse<ReportVersion[]>>> {
  try {
    const { id } = params;

    if (isDbEmpty()) {
      const versions = mockReportVersions.filter((v) => v.reportId === id);
      return NextResponse.json({ success: true, data: versions });
    }

    const versions = getReportVersions(id);
    return NextResponse.json({ success: true, data: versions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        data: [],
        error: { code: "INTERNAL_ERROR", message, detail: String(err) },
      },
      { status: 200 }
    );
  }
}
