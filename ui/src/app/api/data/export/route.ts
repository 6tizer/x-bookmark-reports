/**
 * GET /api/data/export
 * Exports output/, cache/, database, and .env (API keys masked) as a tar.gz download.
 */

import { NextResponse } from "next/server";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { getRepoRoot, getUiPackageRoot } from "@/lib/repo-root";
import { maskApiKey } from "@/lib/config";

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
        "Content-Disposition": `attachment; filename="x-bookmark-reports-export-${new Date().toISOString().slice(0, 10)}.tar.gz"`,
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
