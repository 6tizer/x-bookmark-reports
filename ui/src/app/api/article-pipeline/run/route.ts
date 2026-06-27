/**
 * POST /api/article-pipeline/run
 * Spawns bin/article_pipeline.py and pipes stdout/stderr to UI Logger.
 */

import { NextResponse } from "next/server";
import { spawn, execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { createInterface } from "readline";
import { getRepoRoot } from "@/lib/repo-root";
import { createLog } from "@/lib/db";
import { updateRunState } from "@/lib/fs-data";
import type { ApiResponse } from "@/types/api";

export interface PipelineRunResponse {
  pid: number | undefined;
  startedAt: string;
  command: string[];
}

interface RunBody {
  mode?: "one" | "batch";
  tweetId?: string;
  model?: string;
  noResearch?: boolean;
  noWrite?: boolean;
  force?: boolean;
  limit?: number;
  resume?: boolean;
}

function resolvePython(repoRoot: string): string {
  const venvPy = path.join(repoRoot, ".venv", "bin", "python3");
  if (fs.existsSync(venvPy)) return venvPy;
  return "python3";
}

function killExistingPythonProcesses(): void {
  try {
    const output = execSync("pgrep -f 'python.*article_pipeline\\.py'", {
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

function pipeOutputToLogger(child: ReturnType<typeof spawn>, component: "coordinator" | "article_pipeline" | "notion_upload"): void {
  if (child.stdout) {
    const rl = createInterface({ input: child.stdout });
    rl.on("line", (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const level = /error|fail|exception/i.test(trimmed) ? "error" as const
        : /warn|warning/i.test(trimmed) ? "warn" as const
        : "info" as const;
      try {
        createLog(component, level, trimmed.slice(0, 500), trimmed.length > 500 ? trimmed : undefined);
      } catch {
        /* ignore if DB not ready */
      }
    });
  }
  if (child.stderr) {
    const rl = createInterface({ input: child.stderr });
    rl.on("line", (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        createLog(component, "error", trimmed.slice(0, 500), trimmed.length > 500 ? trimmed : undefined);
      } catch {
        /* ignore */
      }
    });
  }
}

export async function POST(
  request: Request
): Promise<NextResponse<ApiResponse<PipelineRunResponse>>> {
  try {
    const body = (await request.json()) as RunBody;
    const repoRoot = getRepoRoot();
    const script = path.join(repoRoot, "bin", "article_pipeline.py");
    if (!fs.existsSync(script)) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: { code: "NOT_FOUND", message: "article_pipeline.py not found" },
        },
        { status: 500 }
      );
    }

    // Kill any existing Python pipeline processes before starting new one
    killExistingPythonProcesses();

    const py = resolvePython(repoRoot);
    const args: string[] = [script];

    const mode = body.mode ?? (body.tweetId ? "one" : "batch");

    if (mode === "batch") {
      args.push("run-batch");
      if (body.limit && body.limit > 0) {
        args.push("--limit", String(body.limit));
      }
      // Default to resume=true — only skip if explicitly set to false
      if (body.resume !== false) args.push("--resume");
      if (body.force) args.push("--force");
      if (body.model) args.push("--model", body.model);
    } else {
      if (!body.tweetId) {
        return NextResponse.json(
          {
            success: false,
            data: null,
            error: { code: "BAD_REQUEST", message: "tweetId required for mode=one" },
          },
          { status: 400 }
        );
      }
      args.push("run-one", "--id", body.tweetId);
      if (body.force) args.push("--force");
      if (body.model) args.push("--model", body.model);
      if (body.noResearch) args.push("--no-research");
      if (body.noWrite) args.push("--no-write");
    }

    const startedAt = new Date().toISOString();
    // Stage 4：spawn 后立即写 last_run_started
    const articlePipelineStatePath = path.join(repoRoot, "output", ".article-pipeline-state.json");
    updateRunState(articlePipelineStatePath, {
      last_run_started: startedAt,
      last_run_status: "running",
    });

    const child = spawn(py, args, {
      cwd: repoRoot,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    pipeOutputToLogger(child, "article_pipeline");

    // Stage 4：监听 exit / error 事件，写 last_run_finished + last_run_status
    child.on("exit", (code: number | null) => {
      const finishedAt = new Date().toISOString();
      updateRunState(articlePipelineStatePath, {
        last_run_finished: finishedAt,
        last_run_status: code === 0 ? "success" : "failed",
      });
    });
    child.on("error", (err: Error) => {
      const finishedAt = new Date().toISOString();
      updateRunState(articlePipelineStatePath, {
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
