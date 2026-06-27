/**
 * GET  /api/schedule/launchd — 读取 plist 调度配置与 loaded 状态
 * POST /api/schedule/launchd — Load/unload the launchd plist for scheduled runs
 * PUT  /api/schedule/launchd — 切换调度预设（修改 plist 并 reload）
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

/** PUT 请求体：调度预设枚举（白名单防止路径/命令注入） */
type LaunchdPreset = "3h" | "6h" | "12h" | "daily-0" | "daily-8" | "daily-16";

interface LaunchdPutBody {
  preset: LaunchdPreset;
}

/** 预设到 StartCalendarInterval 数组的映射（Hour/Minute 首字母大写为 plist 规范） */
const PRESET_TO_INTERVALS: Record<LaunchdPreset, Array<{ Hour: number; Minute: number }>> = {
  "3h":       [{Hour:0,Minute:0},{Hour:3,Minute:0},{Hour:6,Minute:0},{Hour:9,Minute:0},{Hour:12,Minute:0},{Hour:15,Minute:0},{Hour:18,Minute:0},{Hour:21,Minute:0}],
  "6h":       [{Hour:0,Minute:0},{Hour:6,Minute:0},{Hour:12,Minute:0},{Hour:18,Minute:0}],
  "12h":      [{Hour:0,Minute:0},{Hour:12,Minute:0}],
  "daily-0":  [{Hour:0,Minute:0}],
  "daily-8":  [{Hour:8,Minute:0}],
  "daily-16": [{Hour:16,Minute:0}],
};

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

/**
 * PUT /api/schedule/launchd — 切换调度预设
 *
 * 流程：备份 → plutil 读 JSON → 改写 StartCalendarInterval →
 *      plutil 写回 xml1 → lint 校验 → launchctl reload → 返回新状态
 *
 * 失败链：plutil 写回/lint 失败回滚 .bak 返回 500；
 *        reload 失败回滚 .bak 并再 reload 一次返回 502。
 */
export async function PUT(
  request: Request
): Promise<NextResponse<ApiResponse<LaunchdStatusData>>> {
  try {
    // 1. 校验请求体（preset 必须命中枚举，防止后续命令注入）
    let body: LaunchdPutBody;
    try {
      body = (await request.json()) as LaunchdPutBody;
    } catch {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: { code: "INVALID_BODY", message: "Request body must be valid JSON" },
        },
        { status: 400 }
      );
    }

    if (!body || typeof body.preset !== "string" || !(body.preset in PRESET_TO_INTERVALS)) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: {
            code: "INVALID_PRESET",
            message: "preset must be one of: 3h, 6h, 12h, daily-0, daily-8, daily-16",
          },
        },
        { status: 400 }
      );
    }
    const preset = body.preset as LaunchdPreset;

    // 2. 定位 plist 文件
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
    const bakPath = `${plistPath}.bak`;

    // 3. 备份原 plist（同步 cp，失败则放弃操作）
    try {
      fs.copyFileSync(plistPath, bakPath);
    } catch (err) {
      const message = err instanceof Error ? err.message : "backup failed";
      logger.error("launchd PUT backup failed", `${plistPath}: ${message}`);
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: { code: "BACKUP_FAILED", message },
        },
        { status: 500 }
      );
    }

    /** 回滚：从 .bak 还原 plist 并尝试 reload 一次（尽力恢复运行态） */
    const rollback = (reason: string) => {
      try {
        fs.copyFileSync(bakPath, plistPath);
        try {
          execSync(`launchctl unload ${plistPath}`, { timeout: 10000, stdio: "pipe" });
        } catch {
          /* 未 load 也走 unload 是允许的 */
        }
        try {
          execSync(`launchctl load ${plistPath}`, { timeout: 10000, stdio: "pipe" });
        } catch (reloadErr) {
          const m = reloadErr instanceof Error ? reloadErr.message : "reload after rollback failed";
          logger.error("launchd rollback reload failed", `${plistPath}: ${m}`);
        }
      } catch (restoreErr) {
        const m = restoreErr instanceof Error ? restoreErr.message : "rollback restore failed";
        logger.error("launchd rollback restore failed", `${plistPath}: ${m}`);
      }
      logger.error("launchd PUT rolled back", `${plistPath}: ${reason}`);
    };

    // 4. plutil 读出当前 JSON
    let plistJson: PlistJson;
    try {
      const jsonStr = execSync(`plutil -convert json -o - ${plistPath}`, {
        timeout: 10000,
        encoding: "utf-8",
      });
      plistJson = JSON.parse(jsonStr) as PlistJson;
    } catch (err) {
      const message = err instanceof Error ? err.message : "plutil read failed";
      logger.error("launchd PUT plutil read failed", `${plistPath}: ${message}`);
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: { code: "PLUTIL_READ_ERROR", message },
        },
        { status: 500 }
      );
    }

    // 5. 修改 JSON：替换 StartCalendarInterval，移除 StartInterval
    const newIntervals = PRESET_TO_INTERVALS[preset];
    const updatedPlist: PlistJson & Record<string, unknown> = { ...plistJson };
    delete updatedPlist.StartInterval;
    updatedPlist.StartCalendarInterval = newIntervals;

    // 6. plutil 写回（stdin 喂 JSON，输出 xml1 到原路径）
    try {
      execSync(`plutil -convert xml1 -o ${plistPath} -`, {
        timeout: 10000,
        input: JSON.stringify(updatedPlist),
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "plutil write failed";
      logger.error("launchd PUT plutil write failed", `${plistPath}: ${message}`);
      rollback("plutil write failed");
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: { code: "PLUTIL_WRITE_ERROR", message },
        },
        { status: 500 }
      );
    }

    // 7. lint 校验新 plist
    try {
      execSync(`plutil -lint ${plistPath}`, { timeout: 10000, stdio: "pipe" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "plutil lint failed";
      logger.error("launchd PUT plutil lint failed", `${plistPath}: ${message}`);
      rollback("plutil lint failed");
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: { code: "PLUTIL_LINT_ERROR", message },
        },
        { status: 500 }
      );
    }

    // 8. reload：先 unload 再 load
    try {
      try {
        execSync(`launchctl unload ${plistPath}`, { timeout: 10000, stdio: "pipe" });
      } catch {
        /* 未 load 也走 unload 是允许的 */
      }
      execSync(`launchctl load ${plistPath}`, { timeout: 10000, stdio: "pipe" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "launchctl reload failed";
      logger.error("launchd PUT reload failed", `${plistPath}: ${message}`);
      rollback("launchctl reload failed");
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: { code: "RELOAD_ERROR", message: `launchctl reload failed: ${message}` },
        },
        { status: 502 }
      );
    }

    // 9. 清理 .bak（成功路径，避免残留）+ 返回新状态
    try {
      fs.unlinkSync(bakPath);
    } catch {
      /* 备份清理失败不影响主流程 */
    }

    const newSchedule = parseSchedule(updatedPlist);
    const loaded = isLaunchdLoaded(plistName);
    logger.info("launchd PUT preset applied", `${plistPath}: ${preset}`);

    return NextResponse.json({
      success: true,
      data: {
        loaded,
        plistPath,
        plistName,
        schedule: newSchedule,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("launchd PUT unexpected error", message);
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
