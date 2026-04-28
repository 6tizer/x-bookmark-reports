/**
 * GET /api/reports/[id]/compare
 * CONTRACT v1.0
 */

import { NextResponse } from "next/server";
import { isDbEmpty, getReportById, getReportsForBookmark } from "@/lib/db";
import { getReportById as getMockReport, getReportsForBookmark as getMockReportsForBookmark, mockReports } from "@/db/mock";
import type { ApiResponse, Report, DiffResult } from "@/types/api";

interface RouteParams {
  params: { id: string };
}

function simpleDiff(left: string, right: string): DiffResult {
  const leftLines = left.split("\n");
  const rightLines = right.split("\n");
  let additions = 0;
  let deletions = 0;
  const hunks: DiffResult["hunks"] = [];

  const maxLen = Math.max(leftLines.length, rightLines.length);
  let oldStart = 1;
  let newStart = 1;
  let hunkLines: string[] = [];

  for (let i = 0; i < maxLen; i++) {
    const l = leftLines[i] ?? "";
    const r = rightLines[i] ?? "";
    if (l !== r) {
      if (l) {
        deletions++;
        hunkLines.push(`-${l}`);
      }
      if (r) {
        additions++;
        hunkLines.push(`+${r}`);
      }
    } else {
      if (hunkLines.length > 0) {
        hunks.push({
          oldStart,
          oldLines: deletions,
          newStart,
          newLines: additions,
          lines: [...hunkLines],
        });
        hunkLines = [];
      }
      oldStart = i + 2;
      newStart = i + 2;
    }
  }

  if (hunkLines.length > 0) {
    hunks.push({
      oldStart,
      oldLines: deletions,
      newStart,
      newLines: additions,
      lines: [...hunkLines],
    });
  }

  return { additions, deletions, hunks };
}

export async function GET(
  request: Request,
  { params }: RouteParams
): Promise<
  NextResponse<
    ApiResponse<{
      left: Report;
      right: Report;
      diff: DiffResult;
    }>
  >
> {
  try {
    const { id } = params;
    const { searchParams } = new URL(request.url);
    const withId = searchParams.get("with") ?? "";

    let left: Report | null;
    let right: Report | null;

    if (isDbEmpty()) {
      left = getMockReport(id) ?? null;
      right = withId ? (getMockReport(withId) ?? null) : null;

      // If no withId provided, try to find the complementary report for same bookmark
      if (!right && left) {
        const reports = getMockReportsForBookmark(left.bookmarkId);
        right = reports.enhanced ?? reports.basic ?? null;
        if (right && right.id === left.id) right = null;
      }
    } else {
      left = getReportById(id);
      if (!left) {
        return NextResponse.json(
          {
            success: false,
            data: { left: mockReports[0], right: mockReports[1], diff: { additions: 0, deletions: 0, hunks: [] } },
            error: { code: "REPORT_NOT_FOUND", message: "Left report not found" },
          },
          { status: 404 }
        );
      }

      if (withId) {
        right = getReportById(withId);
      } else {
        const pair = getReportsForBookmark(left.bookmarkId);
        right = pair.enhanced ?? pair.basic ?? null;
        if (right && right.id === left.id) right = null;
      }
    }

    if (!left || !right) {
      return NextResponse.json(
        {
          success: false,
          data: { left: left!, right: right!, diff: { additions: 0, deletions: 0, hunks: [] } },
          error: { code: "REPORT_NOT_FOUND", message: "Comparison report not found" },
        },
        { status: 404 }
      );
    }

    const diff = simpleDiff(left.content, right.content);

    return NextResponse.json({ success: true, data: { left, right, diff } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        data: { left: mockReports[0], right: mockReports[1], diff: { additions: 0, deletions: 0, hunks: [] } },
        error: { code: "INTERNAL_ERROR", message, detail: String(err) },
      },
      { status: 200 }
    );
  }
}
