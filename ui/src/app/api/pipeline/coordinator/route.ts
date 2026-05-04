/**
 * POST /api/pipeline/coordinator
 * Spawns bin/coordinator.py in repo root (detached).
 */

import { NextResponse } from "next/server";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { getRepoRoot } from "@/lib/repo-root";
import type { ApiResponse } from "@/types/api";

interface CoordinatorRunResponse {
  pid: number | undefined;
  startedAt: string;
  command: string[];
}

interface CoordinatorBody {
  limit?: number;
  resume?: boolean;
  full?: boolean;
}

function resolvePython(repoRoot: string): string {
  const venvPy = path.join(repoRoot, ".venv", "bin", "python3");
  if (fs.existsSync(venvPy)) return venvPy;
  return "python3";
}

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

    const py = resolvePython(repoRoot);
    const args: string[] = [script, "--deep-batch"];

    if (body.limit && body.limit > 0) {
      args.push("--limit", String(body.limit));
    }
    if (body.resume) args.push("--resume");
    if (body.full) args.push("--full");

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
