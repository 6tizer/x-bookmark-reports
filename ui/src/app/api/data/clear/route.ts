/**
 * POST /api/data/clear
 * 清除 DB 行 / output 文件 / cache / logs。
 * 保留 .env 和 归档/。
 *
 * Body:
 *   confirm: "DELETE"           必填
 *   scope?: Array<             可选，缺省 = ["db", "output", "cache"]（向后兼容）
 *     "db" | "output" | "cache"
 *   >
 *
 * 返回:
 *   { tablesCleared, filesDeleted, scopesApplied }
 */

import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { getRepoRoot, getUiPackageRoot } from "@/lib/repo-root";
import { getDb } from "@/lib/db";
import type { ApiResponse } from "@/types/api";

export const dynamic = "force-dynamic";

// 合法 scope 白名单 —— 防止前端注入任意字符串
const VALID_SCOPES = new Set(["db", "output", "cache"]);

interface ClearResult {
  tablesCleared: string[];
  filesDeleted: number;
  scopesApplied: string[];
}

interface ClearBody {
  confirm?: string;
  scope?: Array<"db" | "output" | "cache">;
}

export async function POST(
  request: Request
): Promise<NextResponse<ApiResponse<ClearResult>>> {
  try {
    const body = (await request.json()) as ClearBody;

    // 1. 校验 confirm 确认字串
    if (body.confirm !== "DELETE") {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: {
            code: "INVALID_CONFIRM",
            message: "Must confirm with DELETE",
          },
        },
        { status: 400 }
      );
    }

    // 2. 解析 scope —— 缺省全清（向后兼容旧调用）
    const requestedScopes =
      Array.isArray(body.scope) && body.scope.length > 0
        ? Array.from(new Set(body.scope.filter((s) => VALID_SCOPES.has(s))))
        : ["db", "output", "cache"];

    const repoRoot = getRepoRoot();
    const uiRoot = getUiPackageRoot();

    const tablesCleared: string[] = [];
    let filesDeleted = 0;

    // 3. scope = "db" → 清 DB 表（与原逻辑一致）
    if (requestedScopes.includes("db")) {
      try {
        const db = getDb();
        const tables = [
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
        for (const table of tables) {
          try {
            db.exec(`DELETE FROM ${table}`);
            tablesCleared.push(table);
          } catch {
            // 表可能不存在
          }
        }
      } catch {
        /* DB 未就绪 —— 跳过 */
      }
    }

    // 4. scope = "output" → 清 output/（保留 归档/）
    if (requestedScopes.includes("output")) {
      const outputDir = path.join(repoRoot, "output");
      if (fs.existsSync(outputDir)) {
        for (const entry of fs.readdirSync(outputDir)) {
          if (entry === "归档") continue;
          const fullPath = path.join(outputDir, entry);
          try {
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              filesDeleted += removeDir(fullPath);
            } else {
              fs.unlinkSync(fullPath);
              filesDeleted++;
            }
          } catch {
            // skip
          }
        }
      }
    }

    // 5. scope = "cache" → 清 cache/ + UI data/logs/
    //    （语义上 logs 是缓存类，归入 cache scope）
    if (requestedScopes.includes("cache")) {
      const cacheDir = path.join(repoRoot, "cache");
      if (fs.existsSync(cacheDir)) {
        filesDeleted += removeDir(cacheDir);
        fs.mkdirSync(cacheDir, { recursive: true });
      }

      const logDir = path.join(uiRoot, "data", "logs");
      if (fs.existsSync(logDir)) {
        filesDeleted += removeDir(logDir);
        fs.mkdirSync(logDir, { recursive: true });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        tablesCleared,
        filesDeleted,
        scopesApplied: requestedScopes,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, data: null, error: { code: "CLEAR_ERROR", message } },
      { status: 500 }
    );
  }
}

// 递归删除目录及其内容，返回删除文件数
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
