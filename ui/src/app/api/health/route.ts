/**
 * GET /api/health
 * 流水线健康检查：launchd 状态 / 最近运行 / 连续失败 / 积压统计 / API 状态
 * PR-5：7-4~7-7 事故（连续失败 2 天无告警）的监控防御
 */

import { NextResponse } from "next/server";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { getRepoRoot } from "@/lib/repo-root";
import { listLogsSince } from "@/lib/db";
import {
  readPipelineArticles,
  getNotionFinishedSet,
} from "@/lib/fs-data";
import type { ApiResponse, LogComponent } from "@/types/api";

export const dynamic = "force-dynamic";

interface HealthData {
  healthy: boolean;
  launchd: { loaded: boolean; nextTrigger: string | null };
  lastRun: { ts: string; status: string; step: string } | null;
  recentFailStreak: number;
  pendingUploads: number;
  pendingArticles: number;
  apiStatus: { xai: "ok" | "forbidden" | "unknown" };
  warnings: string[];
}

interface PlistCalendarInterval {
  Hour?: number;
  Minute?: number;
}

interface PlistJson {
  StartCalendarInterval?: PlistCalendarInterval | PlistCalendarInterval[];
}

const LAUNCHD_NAMES = ["com.tizer.bookmark-auto", "com.x-bookmark-reports.auto-run"];

function findPlist(): { plistPath: string; plistName: string } | null {
  const repoRoot = getRepoRoot();
  const homeDir = process.env.HOME || "~";
  const candidates = [
    path.join(homeDir, "Library", "LaunchAgents", "com.tizer.bookmark-auto.plist"),
    path.join(homeDir, "Library", "LaunchAgents", "com.x-bookmark-reports.auto-run.plist"),
    path.join(repoRoot, "com.tizer.bookmark-auto.plist"),
    path.join(repoRoot, "com.x-bookmark-reports.auto-run.plist"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return { plistPath: candidate, plistName: path.basename(candidate, ".plist") };
    }
  }
  return null;
}

function isLaunchdLoaded(plistName: string): boolean {
  try {
    execSync(`launchctl list ${plistName}`, { timeout: 5000, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function parseCalendarIntervals(plist: PlistJson): Array<{ hour: number; minute: number }> {
  const raw = plist.StartCalendarInterval;
  if (raw === undefined) return [];
  const items = Array.isArray(raw) ? raw : [raw];
  return items.map((item) => ({
    hour: item.Hour ?? 0,
    minute: item.Minute ?? 0,
  }));
}

function formatNextTrigger(intervals: Array<{ hour: number; minute: number }>): string | null {
  if (intervals.length === 0) return null;

  const now = new Date();
  const candidates: Date[] = [];

  for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
    for (const iv of intervals) {
      const d = new Date(now);
      d.setDate(d.getDate() + dayOffset);
      d.setHours(iv.hour, iv.minute, 0, 0);
      if (d > now) candidates.push(d);
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.getTime() - b.getTime());
  const next = candidates[0];
  const hh = String(next.getHours()).padStart(2, "0");
  const mm = String(next.getMinutes()).padStart(2, "0");

  if (intervals.length === 8) return `每 3h（下一次 ${hh}:${mm}）`;
  if (intervals.length === 4) return `每 6h（下一次 ${hh}:${mm}）`;
  if (intervals.length === 2) return `每 12h（下一次 ${hh}:${mm}）`;
  if (intervals.length === 1) return `每日（下一次 ${hh}:${mm}）`;
  return `下一次 ${hh}:${mm}`;
}

function checkLaunchd(): { loaded: boolean; nextTrigger: string | null } {
  try {
    let loaded = false;
    for (const name of LAUNCHD_NAMES) {
      if (isLaunchdLoaded(name)) {
        loaded = true;
        break;
      }
    }

    const plistInfo = findPlist();
    if (!plistInfo) return { loaded, nextTrigger: null };

    try {
      const jsonStr = execSync(`plutil -convert json -o - ${plistInfo.plistPath}`, {
        timeout: 10000,
        encoding: "utf-8",
      });
      const plistJson = JSON.parse(jsonStr) as PlistJson;
      const intervals = parseCalendarIntervals(plistJson);
      return { loaded, nextTrigger: formatNextTrigger(intervals) };
    } catch {
      return { loaded, nextTrigger: null };
    }
  } catch {
    return { loaded: false, nextTrigger: null };
  }
}

function readHistoryLines(): string[] {
  try {
    const historyPath = path.join(getRepoRoot(), "output", "auto_run_history.jsonl");
    if (!fs.existsSync(historyPath)) return [];
    const content = fs.readFileSync(historyPath, "utf-8");
    return content.split("\n").filter((line) => line.trim().length > 0);
  } catch {
    return [];
  }
}

function getLastRun(lines: string[]): HealthData["lastRun"] {
  if (lines.length === 0) return null;
  try {
    const d = JSON.parse(lines[lines.length - 1]) as Record<string, unknown>;
    return {
      ts: typeof d.last_run === "string" ? d.last_run : "",
      status: typeof d.status === "string" ? d.status : "",
      step: typeof d.step === "string" ? d.step : "",
    };
  } catch {
    return null;
  }
}

function computeRecentFailStreak(lines: string[]): number {
  let streak = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const d = JSON.parse(lines[i]) as Record<string, unknown>;
      const status = typeof d.status === "string" ? d.status : "";
      if (status === "failed") {
        streak++;
      } else if (status === "success" || status === "partial") {
        break;
      }
    } catch {
      /* skip malformed lines */
    }
  }
  return streak;
}

function countPendingUploads(): number {
  try {
    const articles = readPipelineArticles();
    const notionSet = getNotionFinishedSet();
    let count = 0;
    for (const [id, entry] of Object.entries(articles)) {
      if (String(entry.status || "") === "written" && !notionSet.has(id)) {
        count++;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

function countPendingArticles(): number {
  try {
    const articles = readPipelineArticles();
    const terminal = new Set(["written", "uploaded", "skipped", "failed"]);
    const total = Object.keys(articles).length;
    let done = 0;
    for (const entry of Object.values(articles)) {
      if (terminal.has(String(entry.status || ""))) done++;
    }
    return Math.max(0, total - done);
  } catch {
    return 0;
  }
}

function checkXaiStatus(): HealthData["apiStatus"]["xai"] {
  try {
    const sinceIso = new Date(Date.now() - 3600_000).toISOString();
    const components: LogComponent[] = ["article_pipeline", "agent"];
    let hasRecent = false;

    for (const component of components) {
      const logs = listLogsSince(component, sinceIso, 200);
      if (logs.length === 0) continue;
      hasRecent = true;
      for (const log of logs) {
        const text = `${log.message} ${log.detail ?? ""}`.toLowerCase();
        if (text.includes("permission-denied") || text.includes("permission denied")) {
          return "forbidden";
        }
      }
    }

    return hasRecent ? "ok" : "unknown";
  } catch {
    return "unknown";
  }
}

function buildWarnings(data: Omit<HealthData, "healthy" | "warnings">): string[] {
  const warnings: string[] = [];

  if (data.recentFailStreak >= 3) {
    warnings.push(`最近 ${data.recentFailStreak} 次流水线连续失败，请检查日志`);
  }
  if (data.pendingUploads > 10) {
    warnings.push(`${data.pendingUploads} 篇文章积压未上传到 Notion`);
  }
  if (data.apiStatus.xai === "forbidden") {
    warnings.push("xAI API 信用额度用完，research 已 fallback 到 Exa");
  }
  if (!data.launchd.loaded) {
    warnings.push("launchd 调度未加载，流水线不会自动运行");
  }

  return warnings;
}

export async function GET(): Promise<NextResponse<ApiResponse<HealthData>>> {
  const lines = readHistoryLines();

  const launchd = checkLaunchd();
  const lastRun = getLastRun(lines);
  const recentFailStreak = computeRecentFailStreak(lines);
  const pendingUploads = countPendingUploads();
  const pendingArticles = countPendingArticles();
  const xai = checkXaiStatus();

  const partial: Omit<HealthData, "healthy" | "warnings"> = {
    launchd,
    lastRun,
    recentFailStreak,
    pendingUploads,
    pendingArticles,
    apiStatus: { xai },
  };

  const warnings = buildWarnings(partial);
  const data: HealthData = {
    ...partial,
    warnings,
    healthy: warnings.length === 0,
  };

  return NextResponse.json({ success: true, data });
}
