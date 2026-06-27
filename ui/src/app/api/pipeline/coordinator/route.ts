/**
 * POST /api/pipeline/coordinator
 * Sync Bookmarks: runs sync_bookmarks.sh first, then coordinator.py --deep-batch.
 * Kills any existing Python/bash pipeline processes before starting.
 */

import { NextResponse } from "next/server";
import { spawn, execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { getRepoRoot } from "@/lib/repo-root";
import { createLog } from "@/lib/db";
import { pipeOutputToLogger } from "@/lib/pipe-output-to-logger";
import { updateRunState } from "@/lib/fs-data";
import type { ApiResponse } from "@/types/api";

export const dynamic = "force-dynamic";

interface CoordinatorRunResponse {
  pid: number | undefined;
  startedAt: string;
  command: string[];
}

interface CoordinatorBody {
  limit?: number;
  resume?: boolean;
  full?: boolean;
  skipSync?: boolean;
}

function resolvePython(repoRoot: string): string {
  const venvPy = path.join(repoRoot, ".venv", "bin", "python3");
  if (fs.existsSync(venvPy)) return venvPy;
  return "python3";
}

function killExistingPipelineProcesses(): void {
  try {
    const output = execSync(
      "pgrep -f 'python.*coordinator\\.py|sync_bookmarks\\.sh'",
      { encoding: "utf-8", timeout: 5000 }
    ).trim();
    if (!output) return;
    for (const line of output.split("\n")) {
      const pid = parseInt(line.trim(), 10);
      if (!isNaN(pid) && pid > 0) {
        try {
          process.kill(pid, "SIGTERM");
        } catch { /* already dead */ }
      }
    }
  } catch {
    // pgrep returns exit code 1 when no matches
  }
}

/**
 * Run sync_bookmarks.sh then coordinator.py as a chained pipeline.
 * Uses bash -c to serialize: sync_bookmarks.sh && coordinator.py
 */
export async function POST(
  request: Request
): Promise<NextResponse<ApiResponse<CoordinatorRunResponse>>> {
  try {
    const body = (await request.json()) as CoordinatorBody;
    const repoRoot = getRepoRoot();
    const script = path.join(repoRoot, "bin", "coordinator.py");
    if (!fs.existsSync(script)) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: { code: "NOT_FOUND", message: "coordinator.py not found" },
        },
        { status: 500 }
      );
    }

    killExistingPipelineProcesses();

    const py = resolvePython(repoRoot);
    const coordinatorArgs: string[] = [script, "--deep-batch"];
    if (body.limit && body.limit > 0) {
      coordinatorArgs.push("--limit", String(body.limit));
    }
    if (body.resume === false) coordinatorArgs.push("--no-resume");
    if (body.full) coordinatorArgs.push("--full");

    // Build the chained command: sync_bookmarks.sh && coordinator.py
    const parentDir = path.dirname(repoRoot);
    const syncScript = path.join(parentDir, "sync_bookmarks.sh");
    const skipSync = body.skipSync === true || !fs.existsSync(syncScript);

    // Run sync_bookmarks.sh synchronously first (it's fast, ~10s)
    if (!skipSync) {
      try {
        createLog("coordinator", "info", "Running sync_bookmarks.sh to fetch new bookmarks...");
        execSync(`bash '${syncScript}'`, {
          cwd: parentDir,
          encoding: "utf-8",
          timeout: 120000,
          env: { ...process.env },
        });
        createLog("coordinator", "info", "sync_bookmarks.sh completed successfully");
      } catch (syncErr) {
        const errMsg = syncErr instanceof Error ? syncErr.message : String(syncErr);
        createLog("coordinator", "warn", `sync_bookmarks.sh failed: ${errMsg}. Proceeding to coordinator anyway.`);
      }
    }

    // Now spawn coordinator.py as detached process
    const startedAt = new Date().toISOString();
    // Stage 4：spawn 后立即写 last_run_started，解决 B-SYNC-DEEP-TIMESTAMP-MISLEADING
    // 即使 Next.js 进程随后重启，state 文件仍保留「started 但无 finished」的中断信号
    const deepRunStatePath = path.join(repoRoot, "output", ".deep-run-state.json");
    updateRunState(deepRunStatePath, {
      last_run_started: startedAt,
      last_run_status: "running",
    });

    const child = spawn(py, coordinatorArgs, {
      cwd: repoRoot,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    pipeOutputToLogger(child, "coordinator");

    // Stage 4：监听 exit / error 事件，写 last_run_finished + last_run_status
    // 注意：detached + unref 后事件回调仍可触发（Node.js detached child 不影响事件回调）
    // 但若 Next.js 进程在 child exit 前重启，回调丢失——可接受（state 残留 started 无 finished）
    child.on("exit", (code: number | null) => {
      const finishedAt = new Date().toISOString();
      updateRunState(deepRunStatePath, {
        last_run_finished: finishedAt,
        last_run_status: code === 0 ? "success" : "failed",
      });
    });
    child.on("error", (err: Error) => {
      const finishedAt = new Date().toISOString();
      updateRunState(deepRunStatePath, {
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
        command: [py, ...coordinatorArgs],
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
