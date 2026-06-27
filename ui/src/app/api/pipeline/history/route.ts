/**
 * GET /api/pipeline/history
 * 读取 output/auto_run_history.jsonl 倒序返回最近 N 条
 */

import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { getRepoRoot } from "@/lib/repo-root";
import type { ApiResponse } from "@/types/api";

export const dynamic = "force-dynamic";

interface PipelineHistoryItem {
  startedAt: string;
  status: "success" | "failed" | "partial" | "running";
  step: string;
  syncNew: number;
  processNew: number;
  articleNew: number;
  uploadNew: number;
  error: string | null;
  durationSec: number;
}

interface PipelineHistoryResponse {
  items: PipelineHistoryItem[];
  total: number;
}

// 解析单行 JSONL，失败返回 null
function parseLine(line: string): PipelineHistoryItem | null {
  try {
    const d = JSON.parse(line) as Record<string, unknown>;
    return {
      startedAt: typeof d.last_run === "string" ? d.last_run : new Date().toISOString(),
      status: (typeof d.status === "string" ? d.status : "unknown") as PipelineHistoryItem["status"],
      step: typeof d.step === "string" ? d.step : "",
      syncNew: typeof d.sync_new_count === "number" ? d.sync_new_count : 0,
      processNew: typeof d.process_new_count === "number" ? d.process_new_count : 0,
      articleNew: typeof d.article_new_count === "number" ? d.article_new_count : 0,
      uploadNew: typeof d.upload_new_count === "number" ? d.upload_new_count : 0,
      error: typeof d.error === "string" && d.error ? d.error : null,
      durationSec: typeof d.duration_sec === "number" ? d.duration_sec : 0,
    };
  } catch {
    return null;
  }
}

export async function GET(
  request: Request
): Promise<NextResponse<ApiResponse<PipelineHistoryResponse>>> {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);

    const repoRoot = getRepoRoot();
    const historyPath = path.join(repoRoot, "output", "auto_run_history.jsonl");

    // 文件不存在视为空列表
    if (!fs.existsSync(historyPath)) {
      return NextResponse.json({
        success: true,
        data: { items: [], total: 0 },
      });
    }

    const content = fs.readFileSync(historyPath, "utf-8");
    const lines = content.split("\n").filter((line) => line.trim().length > 0);
    const items = lines.map(parseLine).filter((x): x is PipelineHistoryItem => x !== null);

    // 倒序（最新在前），取 top N
    items.reverse();
    const trimmed = items.slice(0, limit);

    return NextResponse.json({
      success: true,
      data: { items: trimmed, total: items.length },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        data: { items: [], total: 0 },
        error: { code: "HISTORY_READ_ERROR", message },
      },
      { status: 500 }
    );
  }
}
