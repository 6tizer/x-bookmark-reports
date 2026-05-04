/**
 * POST /api/data/clear
 * Clears DB rows, output files, cache, and logs. Keeps .env and 归档/.
 */

import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { getRepoRoot, getUiPackageRoot } from "@/lib/repo-root";
import { getDb } from "@/lib/db";
import type { ApiResponse } from "@/types/api";

export const dynamic = "force-dynamic";

interface ClearResult {
  tablesCleared: string[];
  filesDeleted: number;
}

export async function POST(
  request: Request
): Promise<NextResponse<ApiResponse<ClearResult>>> {
  try {
    const body = (await request.json()) as { confirm?: string };
    if (body.confirm !== "DELETE") {
      return NextResponse.json(
        { success: false, data: null, error: { code: "INVALID_CONFIRM", message: "Must confirm with DELETE" } },
        { status: 400 }
      );
    }

    const repoRoot = getRepoRoot();
    const uiRoot = getUiPackageRoot();

    // 1. Clear DB tables
    const db = getDb();
    const tables = ["bookmarks", "sync_jobs", "reports", "report_versions", "articles", "article_versions", "activities", "logs", "external_links", "reply_threads"];
    const tablesCleared: string[] = [];
    for (const table of tables) {
      try {
        db.exec(`DELETE FROM ${table}`);
        tablesCleared.push(table);
      } catch {
        // table may not exist
      }
    }

    // 2. Clear output/ (excluding 归档)
    let filesDeleted = 0;
    const outputDir = path.join(repoRoot, "output");
    if (fs.existsSync(outputDir)) {
      for (const entry of fs.readdirSync(outputDir)) {
        if (entry === "归档") continue;
        const fullPath = path.join(outputDir, entry);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            const count = removeDir(fullPath);
            filesDeleted += count;
          } else {
            fs.unlinkSync(fullPath);
            filesDeleted++;
          }
        } catch {
          // skip
        }
      }
    }

    // 3. Clear cache/
    const cacheDir = path.join(repoRoot, "cache");
    if (fs.existsSync(cacheDir)) {
      filesDeleted += removeDir(cacheDir);
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    // 4. Clear UI data/logs/
    const logDir = path.join(uiRoot, "data", "logs");
    if (fs.existsSync(logDir)) {
      filesDeleted += removeDir(logDir);
      fs.mkdirSync(logDir, { recursive: true });
    }

    return NextResponse.json({
      success: true,
      data: { tablesCleared, filesDeleted },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, data: null, error: { code: "CLEAR_ERROR", message } },
      { status: 500 }
    );
  }
}

function removeDir(dirPath: string): number {
  let count = 0;
  try {
    for (const entry of fs.readdirSync(dirPath)) {
      const fullPath = path.join(dirPath, entry);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          count += removeDir(fullPath);
        } else {
          fs.unlinkSync(fullPath);
          count++;
        }
      } catch {
        // skip
      }
    }
    fs.rmdirSync(dirPath);
  } catch {
    // skip
  }
  return count;
}
