/**
 * GET /api/data/export
 * Exports output/, cache/, database, and .env (API keys masked) as a tar.gz download.
 */

import { NextResponse } from "next/server";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import Database from "better-sqlite3";
import { getRepoRoot, getUiPackageRoot } from "@/lib/repo-root";
import { loadEnv, maskApiKey } from "@/lib/config";
// 导出文件名按产品时区（Asia/Singapore）取日期，而非 UTC
import { localDateStamp } from "@/lib/format-date";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const repoRoot = getRepoRoot();
    const uiRoot = getUiPackageRoot();
    const tmpDir = fs.mkdtempSync("/tmp/xbr-export-");

    // 1. Copy .env with masked API keys
    const envPath = path.join(repoRoot, ".env");
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, "utf-8");
      const sensitiveKeys = [
        "TWITTER_API_IO_KEY", "NOTION_TOKEN", "DEEPSEEK_API_KEY",
        "XAI_API_KEY", "EXA_API_KEY",
      ];
      const masked = envContent
        .split("\n")
        .map((line) => {
          const eqIdx = line.indexOf("=");
          if (eqIdx === -1) return line;
          const key = line.slice(0, eqIdx).trim();
          if (sensitiveKeys.includes(key)) {
            const rawVal = line.slice(eqIdx + 1).replace(/^"|"$/g, "");
            return `${key}="${maskApiKey(rawVal)}"`;
          }
          return line;
        })
        .join("\n");
      fs.writeFileSync(path.join(tmpDir, ".env"), masked);
    }

    // 2. Copy database
    const dbPath = path.join(uiRoot, "data", "x_bookmarks.db");
    if (fs.existsSync(dbPath)) {
      const dbCopyDir = path.join(tmpDir, "data");
      fs.mkdirSync(dbCopyDir, { recursive: true });
      fs.copyFileSync(dbPath, path.join(dbCopyDir, "x_bookmarks.db"));
      // 2.5 脱敏副本 DB 中的 logs / activities 表（避免 API key 泄露）
      redactSecretsInDb(path.join(dbCopyDir, "x_bookmarks.db"), repoRoot);
    }

    // 3. Copy output/ (excluding 归档)
    const outputDir = path.join(repoRoot, "output");
    if (fs.existsSync(outputDir)) {
      const outputCopy = path.join(tmpDir, "output");
      fs.mkdirSync(outputCopy, { recursive: true });
      const entries = fs.readdirSync(outputDir);
      for (const entry of entries) {
        if (entry === "归档") continue;
        const src = path.join(outputDir, entry);
        const dst = path.join(outputCopy, entry);
        try {
          fs.cpSync(src, dst, { recursive: true });
        } catch {
          // skip files that can't be copied
        }
      }
    }

    // 4. Copy cache/ if exists
    const cacheDir = path.join(repoRoot, "cache");
    if (fs.existsSync(cacheDir)) {
      fs.cpSync(cacheDir, path.join(tmpDir, "cache"), { recursive: true });
    }

    // 5. Create tar.gz
    const tarFile = `/tmp/xbr-export-${Date.now()}.tar.gz`;
    execSync(`cd "${tmpDir}" && tar -czf "${tarFile}" .`, { timeout: 60000 });

    // 6. Cleanup temp dir
    fs.rmSync(tmpDir, { recursive: true, force: true });

    // 7. Stream file back
    const stat = fs.statSync(tarFile);
    const stream = fs.createReadStream(tarFile);

    // Clean up tar file after streaming
    stream.on("close", () => {
      try { fs.unlinkSync(tarFile); } catch { /* ignore */ }
    });

    return new Response(stream as unknown as ReadableStream, {
      status: 200,
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="x-bookmark-reports-export-${localDateStamp()}.tar.gz"`,
        "Content-Length": String(stat.size),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: { code: "EXPORT_ERROR", message } },
      { status: 500 }
    );
  }
}

/**
 * 从 .env 读取所有 API key/token，在副本 DB 中替换为 ***REDACTED***。
 * 仅作用于传入的副本路径，原库不会被修改。
 */
function redactSecretsInDb(dbPath: string, _repoRoot: string): void {
  if (!fs.existsSync(dbPath)) return;

  const env = loadEnv();
  const secrets = [
    env.TWITTER_API_IO_KEY,
    env.NOTION_TOKEN,
    env.DEEPSEEK_API_KEY,
    env.XAI_API_KEY,
    env.EXA_API_KEY,
    env.API_KEY,
  ].filter((s): s is string => Boolean(s && s.length >= 8));

  if (secrets.length === 0) return;

  let db: Database.Database;
  try {
    db = new Database(dbPath);
  } catch {
    return; // db lock 或格式错，跳过脱敏
  }

  try {
    // logs 表：message + detail 列（detail 可为 NULL，REPLACE 对 NULL 返回 NULL）
    try {
      for (const secret of secrets) {
        db.prepare(
          "UPDATE logs SET message = REPLACE(message, ?, '***REDACTED***'), detail = REPLACE(detail, ?, '***REDACTED***')"
        ).run(secret, secret);
      }
    } catch {
      /* logs 表可能不存在 */
    }

    // activities 表：message + metadata 列（metadata 可为 NULL）
    try {
      for (const secret of secrets) {
        db.prepare(
          "UPDATE activities SET message = REPLACE(message, ?, '***REDACTED***'), metadata = REPLACE(metadata, ?, '***REDACTED***')"
        ).run(secret, secret);
      }
    } catch {
      /* activities 表可能不存在 */
    }
  } finally {
    db.close();
  }
}
