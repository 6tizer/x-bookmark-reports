/**
 * GET /api/schedule/status
 * Returns current schedule status: last run from auto_run_state.json + launchd plist status
 */

import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { getRepoRoot } from "@/lib/repo-root";
import type { ApiResponse } from "@/types/api";

export const dynamic = "force-dynamic";

interface ScheduleStatus {
  lastRun: string | null;
  lastRunStatus: string | null;
  lastRunStep: string | null;
  lastRunError: string | null;
  /** @deprecated Built-in timer 已删除，保留字段供旧 UI 兼容，恒为 false/null */
  builtInTimerEnabled: boolean;
  /** @deprecated Built-in timer 已删除，保留字段供旧 UI 兼容，恒为 null */
  builtInTimerCron: string | null;
  launchdLoaded: boolean;
  launchdPlistPath: string | null;
}

function readAutoRunState(): Record<string, unknown> {
  const repoRoot = getRepoRoot();
  const statePath = path.join(repoRoot, "output", "auto_run_state.json");
  if (!fs.existsSync(statePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf-8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function checkLaunchdStatus(): { loaded: boolean; plistPath: string | null } {
  const repoRoot = getRepoRoot();

  // Check both possible plist names (legacy + current)
  const plistNames = ["com.tizer.bookmark-auto", "com.x-bookmark-reports.auto-run"];

  for (const plistName of plistNames) {
    const repoPlistPath = path.join(repoRoot, `${plistName}.plist`);
    const homePlistPath = path.join(process.env.HOME || "~", "Library", "LaunchAgents", `${plistName}.plist`);

    try {
      const result = execSync(`launchctl list ${plistName} 2>&1`, {
        encoding: "utf-8",
        timeout: 5000,
      });
      const loaded = !result.includes("could not find") && !result.includes("No such");
      if (loaded) {
        const existingPath = fs.existsSync(homePlistPath) ? homePlistPath : (fs.existsSync(repoPlistPath) ? repoPlistPath : null);
        return { loaded: true, plistPath: existingPath };
      }
    } catch {
      // not loaded, try next
    }
  }

  // Find any existing plist file for display
  for (const plistName of plistNames) {
    const homePlistPath = path.join(process.env.HOME || "~", "Library", "LaunchAgents", `${plistName}.plist`);
    const repoPlistPath = path.join(repoRoot, `${plistName}.plist`);
    if (fs.existsSync(homePlistPath)) return { loaded: false, plistPath: homePlistPath };
    if (fs.existsSync(repoPlistPath)) return { loaded: false, plistPath: repoPlistPath };
  }

  return { loaded: false, plistPath: null };
}

export async function GET(): Promise<NextResponse<ApiResponse<ScheduleStatus>>> {
  try {
    const auto = readAutoRunState();
    const launchd = checkLaunchdStatus();

    const status: ScheduleStatus = {
      lastRun: typeof auto.last_run === "string" ? auto.last_run : null,
      lastRunStatus: typeof auto.status === "string" ? auto.status : null,
      lastRunStep: typeof auto.step === "string" ? auto.step : null,
      lastRunError: typeof auto.error === "string" ? auto.error : null,
      // Built-in timer 已删除（PR-3）：字段保留供旧 UI 兼容，恒为关
      builtInTimerEnabled: false,
      builtInTimerCron: null,
      launchdLoaded: launchd.loaded,
      launchdPlistPath: launchd.plistPath,
    };

    return NextResponse.json({ success: true, data: status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: { code: "SCHEDULE_STATUS_ERROR", message },
      },
      { status: 500 }
    );
  }
}
