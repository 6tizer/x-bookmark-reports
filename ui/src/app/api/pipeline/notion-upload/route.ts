/**
 * POST /api/pipeline/notion-upload
 * Spawns bin/upload_to_notion.py and pipes stdout/stderr to UI Logger.
 */

import { NextResponse } from "next/server";
import { spawn, execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { getRepoRoot } from "@/lib/repo-root";
import { pipeOutputToLogger } from "@/lib/pipe-output-to-logger";
import { updateRunState } from "@/lib/fs-data";
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

function killExistingPythonProcesses(): void {
  try {
    const output = execSync("pgrep -f 'python.*upload_to_notion\\.py'", {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    if (!output) return;
    for (const line of output.split("\n")) {
      const pid = parseInt(line.trim(), 10);
      if (!isNaN(pid) && pid > 0) {
        try {
          process.kill(pid, "SIGTERM");
          // eslint-disable-next-line no-empty
        } catch { /* already dead */ }
      }
    }
  } catch {
    // pgrep returns exit code 1 when no matches — that's fine
  }
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

    // Kill any existing Python pipeline processes before starting new one
    killExistingPythonProcesses();

    const py = resolvePython(repoRoot);
    const args: string[] = [script, "--mode", "finished", "--live"];

    if (body.ids) args.push("--ids", body.ids);
    if (body.file) args.push("--file", body.file);
    if (body.limit && body.limit > 0) {
      args.push("--limit", String(body.limit));
    }

    const startedAt = new Date().toISOString();
    // Stage 4：spawn 后立即写 last_run_started（保留原 uploaded 数组不变）
    const notionFinishedStatePath = path.join(repoRoot, "output", ".notion-finished-state.json");
    updateRunState(notionFinishedStatePath, {
      last_run_started: startedAt,
      last_run_status: "running",
    });

    const child = spawn(py, args, {
      cwd: repoRoot,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    pipeOutputToLogger(child, "notion_upload");

    // Stage 4：监听 exit / error 事件，写 last_run_finished + last_run_status
    child.on("exit", (code: number | null) => {
      const finishedAt = new Date().toISOString();
      updateRunState(notionFinishedStatePath, {
        last_run_finished: finishedAt,
        last_run_status: code === 0 ? "success" : "failed",
      });
    });
    child.on("error", (err: Error) => {
      const finishedAt = new Date().toISOString();
      updateRunState(notionFinishedStatePath, {
        last_run_finished: finishedAt,
        last_run_status: "failed",
        last_run_error: err.message,
      });
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
