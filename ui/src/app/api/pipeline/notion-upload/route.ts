/**
 * POST /api/pipeline/notion-upload
 * Spawns bin/upload_to_notion.py in repo root (detached).
 */

import { NextResponse } from "next/server";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { getRepoRoot } from "@/lib/repo-root";
import type { ApiResponse } from "@/types/api";

interface NotionUploadRunResponse {
  pid: number | undefined;
  startedAt: string;
  command: string[];
}

interface NotionUploadBody {
  ids?: string;
  file?: string;
  limit?: number;
}

function resolvePython(repoRoot: string): string {
  const venvPy = path.join(repoRoot, ".venv", "bin", "python3");
  if (fs.existsSync(venvPy)) return venvPy;
  return "python3";
}

export async function POST(
  request: Request
): Promise<NextResponse<ApiResponse<NotionUploadRunResponse>>> {
  try {
    const body = (await request.json()) as NotionUploadBody;
    const repoRoot = getRepoRoot();
    const script = path.join(repoRoot, "bin", "upload_to_notion.py");
    if (!fs.existsSync(script)) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: { code: "NOT_FOUND", message: "upload_to_notion.py not found" },
        },
        { status: 500 }
      );
    }

    const py = resolvePython(repoRoot);
    const args: string[] = [script, "--mode", "finished", "--live"];

    if (body.ids) args.push("--ids", body.ids);
    if (body.file) args.push("--file", body.file);
    if (body.limit && body.limit > 0) {
      args.push("--limit", String(body.limit));
    }

    const startedAt = new Date().toISOString();
    const child = spawn(py, args, {
      cwd: repoRoot,
      detached: true,
      stdio: "ignore",
      env: { ...process.env },
    });
    child.unref();

    return NextResponse.json({
      success: true,
      data: {
        pid: child.pid,
        startedAt,
        command: [py, ...args],
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: { code: "INTERNAL_ERROR", message, detail: String(err) },
      },
      { status: 500 }
    );
  }
}
