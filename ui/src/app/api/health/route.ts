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
import { loadEnv, getCfBrowserTokenFallback, getCfBrowserDailyUsage } from "@/lib/config";
import { listLogsSince } from "@/lib/db";
import {
  readPipelineArticles,
  getNotionFinishedSet,
} from "@/lib/fs-data";
import type { ApiResponse, LogComponent } from "@/types/api";
// 下一次触发时刻按产品时区（Asia/Singapore）计算，不依赖 Node 进程所在机器的时区
import { formatDateTime, localHourMinute } from "@/lib/format-date";
import healthMessages from "@/lib/i18n/messages/health";

export const dynamic = "force-dynamic";

type XaiStatus = "ok" | "forbidden" | "unknown";
// degraded = 实例可达但搜索返回 0 结果（引擎限流/失效，HTTP 层看不出问题）
type SearxngStatus = "ok" | "degraded" | "unconfigured" | "error";
type KeyStatus = "ok" | "keyless";
type CfBrowserStatus = "ok" | "unconfigured" | "disabled" | "exhausted";

// 模块级 SearXNG 状态内存缓存（15 分钟 TTL）：
// 防止 HealthBanner 每 60s 轮询触发真实搜索并扇出到上游引擎打出验证码（修复 B-HEALTH-SEARXNG-CACHED）
let searxngMemo: { at: number; base: string; status: SearxngStatus } | null = null;
const SEARXNG_MEMO_TTL_MS = 15 * 60 * 1000;

interface HealthData {
  healthy: boolean;
  launchd: { loaded: boolean; nextTrigger: string | null };
  lastRun: { ts: string; status: string; step: string } | null;
  recentFailStreak: number;
  pendingUploads: number;
  pendingArticles: number;
  apiStatus: {
    xai: XaiStatus;
    searxng: SearxngStatus;
    firecrawl: KeyStatus;
    exa: KeyStatus;
    cfBrowser: CfBrowserStatus;
  };
  /** cache/network_profile.json 摘要；null = 从未检测 */
  network: { mode: string; proxy: string | null; checkedAt: string | null } | null;
  /** 网络不可用或流水线停摆时为 true，HealthBanner 据此给出「一键修复网络」入口 */
  suggestNetworkFix: boolean;
  /** 结构化告警，前端按 health 词典 issue.<code> 渲染为当前语言 */
  issues: HealthIssue[];
  /** issues 的中文文本版 */
  warnings: string[];
}

interface HealthIssue {
  code: string;
  params: Record<string, string | number>;
}

// 超过这个时长没有成功运行就告警（每 3h 一次，容忍错过 1 次）
const STALL_HOURS = 7;

interface PlistCalendarInterval {
  Hour?: number;
  Minute?: number;
}

interface PlistJson {
  StartCalendarInterval?: PlistCalendarInterval | PlistCalendarInterval[];
}

function discoverLaunchdCandidates(): Array<{ plistPath: string; plistName: string }> {
  const repoRoot = getRepoRoot();
  const homeDir = process.env.HOME || "~";
  const agentsDir = path.join(homeDir, "Library", "LaunchAgents");
  const candidates: Array<{ plistPath: string; plistName: string }> = [];

  if (fs.existsSync(agentsDir)) {
    try {
      for (const file of fs.readdirSync(agentsDir)) {
        if (
          file === "com.x-bookmark-reports.auto-run.plist" ||
          /^com\.[^.]+\.bookmark-auto\.plist$/.test(file)
        ) {
          candidates.push({
            plistPath: path.join(agentsDir, file),
            plistName: path.basename(file, ".plist"),
          });
        }
      }
    } catch {
      /* ignore */
    }
  }

  const repoDefault = path.join(repoRoot, "com.x-bookmark-reports.auto-run.plist");
  if (fs.existsSync(repoDefault)) {
    candidates.push({
      plistPath: repoDefault,
      plistName: "com.x-bookmark-reports.auto-run",
    });
  }
  return candidates;
}

function findPlist(): { plistPath: string; plistName: string } | null {
  const list = discoverLaunchdCandidates();
  return list.length > 0 ? list[0] : null;
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

  // launchd 的 StartCalendarInterval 是按机器本地时钟触发的；这里用产品时区
  // （Asia/Singapore，与机器一致）的"当前时分"找下一个触发点，只比较一天内的分钟数，
  // 不依赖 Node 进程的 TZ 设置。找不到今天的就取明天的第一个。
  const { hour: nowH, minute: nowM } = localHourMinute();
  const nowMin = nowH * 60 + nowM;
  const sorted = [...intervals].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
  const next = sorted.find((iv) => iv.hour * 60 + iv.minute > nowMin) ?? sorted[0];
  const hh = String(next.hour).padStart(2, "0");
  const mm = String(next.minute).padStart(2, "0");

  if (intervals.length === 8) return `每 3h（下一次 ${hh}:${mm}）`;
  if (intervals.length === 4) return `每 6h（下一次 ${hh}:${mm}）`;
  if (intervals.length === 2) return `每 12h（下一次 ${hh}:${mm}）`;
  if (intervals.length === 1) return `每日（下一次 ${hh}:${mm}）`;
  return `下一次 ${hh}:${mm}`;
}

function checkLaunchd(): { loaded: boolean; nextTrigger: string | null } {
  try {
    let loaded = false;
    const candidates = discoverLaunchdCandidates();
    for (const item of candidates) {
      if (isLaunchdLoaded(item.plistName)) {
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

/** 距最近一次 success / partial 的小时数；没有记录返回 null */
function hoursSinceLastSuccess(lines: string[]): number | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const d = JSON.parse(lines[i]) as Record<string, unknown>;
      if ((d.status === "success" || d.status === "partial") && typeof d.last_run === "string") {
        return (Date.now() - new Date(d.last_run).getTime()) / 3600_000;
      }
    } catch {
      /* skip malformed lines */
    }
  }
  return null;
}

/**
 * auto_run_state.json 停在 running，但锁持有进程已不在 → 上一次运行被强杀或崩溃，没来得及写终态。
 * 返回中断时的步骤与时间，正常时返回 null。
 */
function detectInterruptedRun(): { step: string; ts: string } | null {
  try {
    const repoRoot = getRepoRoot();
    const statePath = path.join(repoRoot, "output", "auto_run_state.json");
    if (!fs.existsSync(statePath)) return null;
    const state = JSON.parse(fs.readFileSync(statePath, "utf-8")) as Record<string, unknown>;
    if (state.status !== "running") return null;

    const pidPath = path.join(repoRoot, "output", "auto_run.lock", "pid");
    if (fs.existsSync(pidPath)) {
      const pid = parseInt(fs.readFileSync(pidPath, "utf-8").trim(), 10);
      if (pid > 0) {
        try {
          process.kill(pid, 0);
          return null;
        } catch {
          /* 进程已不存在 */
        }
      }
    }
    return { step: String(state.step || "unknown"), ts: String(state.last_run || "") };
  } catch {
    return null;
  }
}

function readNetworkSummary(): HealthData["network"] {
  try {
    const p = path.join(getRepoRoot(), "cache", "network_profile.json");
    if (!fs.existsSync(p)) return null;
    const d = JSON.parse(fs.readFileSync(p, "utf-8")) as Record<string, unknown>;
    return {
      mode: typeof d.mode === "string" ? d.mode : "unknown",
      proxy: typeof d.proxy === "string" ? d.proxy : null,
      checkedAt: typeof d.checked_at === "string" ? d.checked_at : null,
    };
  } catch {
    return null;
  }
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

function checkXaiStatus(): XaiStatus {
  try {
    const env = loadEnv();
    if (!(env.XAI_API_KEY || "").trim()) {
      return "unknown";
    }
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

    // 同时检查 logs/bookmark-auto.log 尾部（auto_run.sh 只写文件日志不写 SQLite）
    const logPath = path.join(getRepoRoot(), "logs", "bookmark-auto.log");
    if (fs.existsSync(logPath)) {
      const stat = fs.statSync(logPath);
      const readSize = Math.min(stat.size, 128 * 1024);
      const fd = fs.openSync(logPath, "r");
      const buf = Buffer.alloc(readSize);
      fs.readSync(fd, buf, 0, readSize, Math.max(0, stat.size - readSize));
      fs.closeSync(fd);
      const tailText = buf.toString("utf-8");
      if (
        tailText.includes("x.ai") &&
        (tailText.includes("permission-denied") || tailText.includes("403 Forbidden"))
      ) {
        return "forbidden";
      }
    }

    return hasRecent ? "ok" : "unknown";
  } catch {
    return "unknown";
  }
}

/** SearXNG：配置且 /search?q=test 返回 200 且结果非空 → ok（带 cache: "no-store" + 15min 内存节流） */
async function checkSearxngStatus(): Promise<SearxngStatus> {
  const env = loadEnv();
  const base = (env.SEARXNG_BASE_URL || "").trim().replace(/\/$/, "");
  if (!base) return "unconfigured";

  const now = Date.now();
  if (
    searxngMemo &&
    searxngMemo.base === base &&
    now - searxngMemo.at < SEARXNG_MEMO_TTL_MS &&
    searxngMemo.status === "ok"
  ) {
    return searxngMemo.status;
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`${base}/search?q=test&format=json`, {
      cache: "no-store",
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timer);
    if (!res.ok) {
      searxngMemo = { at: now, base, status: "error" };
      return "error";
    }
    // HTTP 200 不代表可用：引擎全部限流时返回空 results（08-11 事故盲点），
    // 必须断言真实查询有结果
    const data = (await res.json()) as { results?: unknown[] };
    const status: SearxngStatus = (data.results?.length ?? 0) > 0 ? "ok" : "degraded";
    searxngMemo = { at: now, base, status };
    return status;
  } catch {
    searxngMemo = { at: now, base, status: "error" };
    return "error";
  }
}

function checkFirecrawlStatus(): KeyStatus {
  const env = loadEnv();
  return (env.FIRECRAWL_API_KEY || "").trim() ? "ok" : "keyless";
}

function checkExaStatus(): KeyStatus {
  const env = loadEnv();
  return (env.EXA_API_KEY || "").trim() ? "ok" : "keyless";
}

function checkCfBrowserStatus(): CfBrowserStatus {
  const env = loadEnv();
  const enabledRaw = (env.CF_BROWSER_ENABLED ?? "1").trim().toLowerCase();
  if (["0", "false", "no"].includes(enabledRaw)) {
    return "disabled";
  }
  const token = (env.CF_BROWSER_API_TOKEN || getCfBrowserTokenFallback()).trim();
  if (!token) {
    return "unconfigured";
  }
  const usage = getCfBrowserDailyUsage();
  return usage.exhausted ? "exhausted" : "ok";
}

interface RunSignals {
  interrupted: { step: string; ts: string } | null;
  hoursSinceSuccess: number | null;
}

function buildIssues(
  data: Omit<HealthData, "healthy" | "warnings" | "issues" | "suggestNetworkFix">,
  signals: RunSignals
): HealthIssue[] {
  const issues: HealthIssue[] = [];

  if (data.recentFailStreak >= 3) {
    issues.push({ code: "failStreak", params: { count: data.recentFailStreak } });
  }
  if (signals.interrupted) {
    issues.push({
      code: "interrupted",
      params: { step: signals.interrupted.step, at: formatDateTime(signals.interrupted.ts) },
    });
  }
  if (data.launchd.loaded && signals.hoursSinceSuccess !== null && signals.hoursSinceSuccess > STALL_HOURS) {
    issues.push({ code: "stalled", params: { hours: Math.floor(signals.hoursSinceSuccess) } });
  }
  if (data.network?.mode === "offline") {
    issues.push({ code: "networkOffline", params: {} });
  }
  if (data.pendingUploads > 10) {
    issues.push({ code: "pendingUploads", params: { count: data.pendingUploads } });
  }
  if (data.apiStatus.searxng === "error") {
    issues.push({ code: "searxngError", params: {} });
  }
  if (data.apiStatus.searxng === "degraded") {
    issues.push({ code: "searxngDegraded", params: {} });
  }
  if (!data.launchd.loaded) {
    issues.push({ code: "launchdNotLoaded", params: {} });
  }

  return issues;
}

/** 中文文本版告警（curl / 日志可读），文案与前端共用 health 词典 */
function renderIssueZh(issue: HealthIssue): string {
  const text = (healthMessages.zh as Record<string, string>)[`issue.${issue.code}`] ?? issue.code;
  return text.replace(/\{(\w+)\}/g, (m, name: string) =>
    name in issue.params ? String(issue.params[name]) : m
  );
}

export async function GET(): Promise<NextResponse<ApiResponse<HealthData>>> {
  const lines = readHistoryLines();

  const launchd = checkLaunchd();
  const lastRun = getLastRun(lines);
  const recentFailStreak = computeRecentFailStreak(lines);
  const pendingUploads = countPendingUploads();
  const pendingArticles = countPendingArticles();
  const xai = checkXaiStatus();
  const searxng = await checkSearxngStatus();
  const firecrawl = checkFirecrawlStatus();
  const exa = checkExaStatus();
  const cfBrowser = checkCfBrowserStatus();

  const network = readNetworkSummary();
  const signals: RunSignals = {
    interrupted: detectInterruptedRun(),
    hoursSinceSuccess: hoursSinceLastSuccess(lines),
  };

  const partial: Omit<HealthData, "healthy" | "warnings" | "issues" | "suggestNetworkFix"> = {
    launchd,
    lastRun,
    recentFailStreak,
    pendingUploads,
    pendingArticles,
    apiStatus: { xai, searxng, firecrawl, exa, cfBrowser },
    network,
  };

  const issues = buildIssues(partial, signals);
  const warnings = issues.map(renderIssueZh);
  const stalled =
    signals.interrupted !== null ||
    (launchd.loaded && signals.hoursSinceSuccess !== null && signals.hoursSinceSuccess > STALL_HOURS);
  const lastFailedAtNetwork = lastRun?.status === "failed" && lastRun.step === "proxy_check";
  const data: HealthData = {
    ...partial,
    suggestNetworkFix: network?.mode === "offline" || lastFailedAtNetwork || stalled,
    issues,
    warnings,
    healthy: warnings.length === 0,
  };

  return NextResponse.json({ success: true, data });
}
