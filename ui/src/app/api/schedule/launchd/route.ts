/**
 * GET  /api/schedule/launchd — 读取 plist 调度配置与 loaded 状态
 * POST /api/schedule/launchd — Load/unload the launchd plist for scheduled runs
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

/** 调度类型：日历触发 / 固定间隔 / 未知 */
type ScheduleType = "calendar" | "interval" | "unknown";

interface LaunchdSchedule {
  type: ScheduleType;
  intervals?: Array<{ hour?: number; minute?: number }>;
  seconds?: number;
}

interface LaunchdStatusData {
  loaded: boolean;
  plistPath: string;
  plistName: string;
  schedule: LaunchdSchedule;
}

interface PlistInfo {
  plistPath: string;
  plistName: string;
}

/** plist 中 StartCalendarInterval 单条记录的原始字段（首字母大写） */
interface PlistCalendarInterval {
  Hour?: number;
  Minute?: number;
}

/** plutil 转 JSON 后的 plist 顶层结构（仅关心调度相关字段） */
interface PlistJson {
  StartCalendarInterval?: PlistCalendarInterval | PlistCalendarInterval[];
  StartInterval?: number;
}

/**
 * 在 4 个候选路径中查找已存在的 plist，与 POST handler 共用
 */
function findPlist(): PlistInfo | null {
  const repoRoot = getRepoRoot();
  const homeDir = process.env.HOME || "~";
  const plistCandidates = [
    path.join(homeDir, "Library", "LaunchAgents", "com.tizer.bookmark-auto.plist"),
    path.join(homeDir, "Library", "LaunchAgents", "com.x-bookmark-reports.auto-run.plist"),
    path.join(repoRoot, "com.tizer.bookmark-auto.plist"),
    path.join(repoRoot, "com.x-bookmark-reports.auto-run.plist"),
  ];

  for (const candidate of plistCandidates) {
    if (fs.existsSync(candidate)) {
      return {
        plistPath: candidate,
        plistName: path.basename(candidate, ".plist"),
      };
    }
  }
  return null;
}

/** 从 plist JSON 提取调度信息 */
function parseSchedule(plist: PlistJson): LaunchdSchedule {
  const raw = plist.StartCalendarInterval;
  if (raw !== undefined) {
    // 单 dict 或数组均统一为数组处理
    const items = Array.isArray(raw) ? raw : [raw];
    const intervals = items.map((item) => ({
      hour: item.Hour,
      minute: item.Minute,
    }));
    return { type: "calendar", intervals };
  }

  if (plist.StartInterval !== undefined) {
    return { type: "interval", seconds: plist.StartInterval };
  }

  return { type: "unknown" };
}

/** launchctl list 检查 job 是否已 load（exit 0 = loaded） */
function isLaunchdLoaded(plistName: string): boolean {
  try {
    execSync(`launchctl list ${plistName}`, { timeout: 5000, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export async function GET(): Promise<NextResponse<ApiResponse<LaunchdStatusData>>> {
  try {
    const plistInfo = findPlist();
    if (!plistInfo) {
      const repoRoot = getRepoRoot();
      const homeDir = process.env.HOME || "~";
      const checked = [
        path.join(homeDir, "Library", "LaunchAgents", "com.tizer.bookmark-auto.plist"),
        path.join(homeDir, "Library", "LaunchAgents", "com.x-bookmark-reports.auto-run.plist"),
        path.join(repoRoot, "com.tizer.bookmark-auto.plist"),
        path.join(repoRoot, "com.x-bookmark-reports.auto-run.plist"),
      ].join(", ");
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: { code: "PLIST_NOT_FOUND", message: "No launchd plist found. Checked: " + checked },
        },
        { status: 404 }
      );
    }

    const { plistPath, plistName } = plistInfo;

    let plistJson: PlistJson;
    try {
      const jsonStr = execSync(`plutil -convert json -o - ${plistPath}`, {
        timeout: 10000,
        encoding: "utf-8",
      });
      plistJson = JSON.parse(jsonStr) as PlistJson;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown plutil error";
      logger.error("plutil parse failed", `${plistPath}: ${message}`);
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: { code: "PLUTIL_ERROR", message },
        },
        { status: 500 }
      );
    }

    const schedule = parseSchedule(plistJson);
    const loaded = isLaunchdLoaded(plistName);

    return NextResponse.json({
      success: true,
      data: {
        loaded,
        plistPath,
        plistName,
        schedule,
      },
    });
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

export async function POST(
  request: Request
): Promise<NextResponse<ApiResponse<LaunchdResult>>> {
  try {
    const body = (await request.json()) as LaunchdBody;
    const plistInfo = findPlist();

    if (!plistInfo) {
      const repoRoot = getRepoRoot();
      const homeDir = process.env.HOME || "~";
      const checked = [
        path.join(homeDir, "Library", "LaunchAgents", "com.tizer.bookmark-auto.plist"),
        path.join(homeDir, "Library", "LaunchAgents", "com.x-bookmark-reports.auto-run.plist"),
        path.join(repoRoot, "com.tizer.bookmark-auto.plist"),
        path.join(repoRoot, "com.x-bookmark-reports.auto-run.plist"),
      ].join(", ");
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: { code: "PLIST_NOT_FOUND", message: "No launchd plist found. Checked: " + checked },
        },
        { status: 404 }
      );
    }

    const { plistPath } = plistInfo;

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
