/**
 * GET /api/data/preview
 * 预览 Clear All Data 会删什么，不实际删
 * 返回 DB 表行数 / output 文件数（排除归档）/ cache 文件数 / state 文件数
 */

import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { getRepoRoot } from "@/lib/repo-root";
import { getDb } from "@/lib/db";
import type { ApiResponse } from "@/types/api";

// Next.js 强制动态渲染，避免缓存预览结果
export const dynamic = "force-dynamic";

interface DbTablePreview {
  name: string;
  rows: number;
}

interface DataPreview {
  dbTables: DbTablePreview[];
  dbTotalRows: number;
  outputFiles: number;
  cacheFiles: number;
  stateFiles: number; // output 下的 state 文件（.json）
}

// 与 clear 路由保持一致的表清单
const TABLES = [
  "bookmarks",
  "sync_jobs",
  "reports",
  "report_versions",
  "articles",
  "article_versions",
  "activities",
  "logs",
  "external_links",
  "reply_threads",
];

// 递归统计目录下文件数（不跟踪符号链接）
function countFiles(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  const walk = (p: string) => {
    try {
      const stat = fs.statSync(p);
      if (stat.isDirectory()) {
        for (const e of fs.readdirSync(p)) walk(path.join(p, e));
      } else {
        n++;
      }
    } catch {
      /* 跳过无权限 / 已删除的条目 */
    }
  };
  walk(dir);
  return n;
}

// 统计 output/ 文件数（排除 归档/），同时统计 state 文件（.json 隐藏文件）
function countOutputFilesExcludingArchive(
  outputDir: string
): { total: number; stateFiles: number } {
  if (!fs.existsSync(outputDir)) return { total: 0, stateFiles: 0 };
  let total = 0;
  let stateFiles = 0;
  for (const entry of fs.readdirSync(outputDir)) {
    if (entry === "归档") continue; // 归档目录永久保留
    const fullPath = path.join(outputDir, entry);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        total += countFiles(fullPath);
      } else {
        total++;
        if (entry.startsWith(".") && entry.endsWith(".json")) stateFiles++;
      }
    } catch {
      /* 跳过 */
    }
  }
  return { total, stateFiles };
}

export async function GET(): Promise<NextResponse<ApiResponse<DataPreview>>> {
  try {
    const repoRoot = getRepoRoot();

    // 1. 统计 DB 各表行数（表可能尚未创建，catch 跳过）
    const dbTables: DbTablePreview[] = [];
    let dbTotalRows = 0;
    try {
      const db = getDb();
      for (const name of TABLES) {
        try {
          const row = db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get() as
            | { n: number }
            | undefined;
          const rows = row?.n ?? 0;
          dbTables.push({ name, rows });
          dbTotalRows += rows;
        } catch {
          // 表可能不存在（首次运行）
        }
      }
    } catch {
      /* DB 未就绪 */
    }

    // 2. output/（排除 归档/）
    const outputDir = path.join(repoRoot, "output");
    const { total: outputFiles, stateFiles } =
      countOutputFilesExcludingArchive(outputDir);

    // 3. cache/
    const cacheFiles = countFiles(path.join(repoRoot, "cache"));

    return NextResponse.json({
      success: true,
      data: { dbTables, dbTotalRows, outputFiles, cacheFiles, stateFiles },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: { code: "PREVIEW_ERROR", message },
      },
      { status: 500 }
    );
  }
}
