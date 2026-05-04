/**
 * POST /api/schedule/launchd
 * Load/unload the launchd plist for scheduled runs
 */

import { NextResponse } from "next/server";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { getRepoRoot } from "@/lib/repo-root";
import { getLogger } from "@/lib/logger";
import type { ApiResponse } from "@/types/api";

export const dynamic = "force-dynamic";

const logger = getLogger("system");

interface LaunchdBody {
  action: "load" | "unload";
}

interface LaunchdResult {
  action: string;
  success: boolean;
  message: string;
}

export async function POST(
  request: Request
): Promise<NextResponse<ApiResponse<LaunchdResult>>> {
  try {
    const body = (await request.json()) as LaunchdBody;
    const repoRoot = getRepoRoot();
    const homeDir = process.env.HOME || "~";
    // Search both possible plist names and locations
    const plistCandidates = [
      path.join(homeDir, "Library", "LaunchAgents", "com.tizer.bookmark-auto.plist"),
      path.join(homeDir, "Library", "LaunchAgents", "com.x-bookmark-reports.auto-run.plist"),
      path.join(repoRoot, "com.tizer.bookmark-auto.plist"),
      path.join(repoRoot, "com.x-bookmark-reports.auto-run.plist"),
    ];

    let plistPath: string | null = null;
    let plistName: string | null = null;
    for (const candidate of plistCandidates) {
      if (fs.existsSync(candidate)) {
        plistPath = candidate;
        plistName = path.basename(candidate, ".plist");
        break;
      }
    }

    if (!plistPath || !plistName) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: { code: "PLIST_NOT_FOUND", message: "No launchd plist found. Checked: " + plistCandidates.join(", ") },
        },
        { status: 404 }
      );
    }

    if (body.action === "load") {
      execSync(`launchctl load ${plistPath}`, { timeout: 10000 });
      logger.info("launchd plist loaded");
      return NextResponse.json({
        success: true,
        data: { action: "load", success: true, message: "Plist loaded successfully" },
      });
    } else if (body.action === "unload") {
      execSync(`launchctl unload ${plistPath}`, { timeout: 10000 });
      logger.info("launchd plist unloaded");
      return NextResponse.json({
        success: true,
        data: { action: "unload", success: true, message: "Plist unloaded successfully" },
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: { code: "INVALID_ACTION", message: "Action must be 'load' or 'unload'" },
        },
        { status: 400 }
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: { code: "LAUNCHD_ERROR", message },
      },
      { status: 500 }
    );
  }
}
