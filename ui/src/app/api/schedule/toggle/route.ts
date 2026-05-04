/**
 * POST /api/schedule/toggle
 * Enable/disable the built-in timer with a cron expression
 */

import { NextResponse } from "next/server";
import { setTimerState, getTimerState } from "@/lib/scheduler-state";
import { getLogger } from "@/lib/logger";
import type { ApiResponse } from "@/types/api";
import { updateEnv } from "@/lib/config";

export const dynamic = "force-dynamic";

const logger = getLogger("system");

// Store the scheduled task reference in module scope
let scheduledTask: ReturnType<typeof import("node-cron").schedule> | null = null;

interface ToggleBody {
  enabled: boolean;
  cronExpression: string;
}

interface ScheduleToggleResult {
  enabled: boolean;
  cronExpression: string | null;
}

function getPipelineRunner() {
  const { spawn } = require("child_process");
  const path = require("path");
  const { getRepoRoot } = require("@/lib/repo-root");
  const fs = require("fs");

  const repoRoot = getRepoRoot();
  const venvPy = path.join(repoRoot, ".venv", "bin", "python3");
  const py = fs.existsSync(venvPy) ? venvPy : "python3";

  function runStep(script: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(py, [path.join(repoRoot, "bin", script), ...args], {
        cwd: repoRoot,
        stdio: "ignore",
        env: { ...process.env },
      });
      child.on("close", (code: number) => {
        if (code === 0) resolve();
        else reject(new Error(`${script} exited with code ${code}`));
      });
      child.on("error", reject);
    });
  }

  return async () => {
    try {
      logger.info("Scheduled pipeline run started");
      await runStep("coordinator.py", ["--deep-batch"]);
      await runStep("article_pipeline.py", ["run-batch"]);
      await runStep("upload_to_notion.py", ["--mode", "finished", "--live"]);
      logger.info("Scheduled pipeline run completed");
    } catch (err) {
      logger.error("Scheduled pipeline run failed", String(err));
    }
  };
}

export async function POST(
  request: Request
): Promise<NextResponse<ApiResponse<ScheduleToggleResult>>> {
  try {
    const body = (await request.json()) as ToggleBody;

    if (!body.cronExpression || body.cronExpression.split(/\s+/).length !== 5) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: { code: "INVALID_CRON", message: "Invalid cron expression. Must have 5 fields." },
        },
        { status: 400 }
      );
    }

    // Stop existing task if any
    if (scheduledTask) {
      scheduledTask.stop();
      scheduledTask = null;
    }

    if (body.enabled) {
      // Dynamic import for node-cron
      const cron = await import("node-cron");
      const runner = getPipelineRunner();

      scheduledTask = cron.schedule(body.cronExpression, runner);

      setTimerState(true, body.cronExpression);
      logger.info(`Built-in timer enabled: ${body.cronExpression}`);
    } else {
      setTimerState(false, null);
      logger.info("Built-in timer disabled");
    }

    // Persist cron to .env
    updateEnv({
      CRON_EXPRESSION: body.enabled ? body.cronExpression : "",
      AUTO_SYNC: body.enabled ? "true" : "false",
    });

    const state = getTimerState();
    return NextResponse.json({
      success: true,
      data: {
        enabled: state.enabled,
        cronExpression: state.cron,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: { code: "SCHEDULE_TOGGLE_ERROR", message },
      },
      { status: 500 }
    );
  }
}
