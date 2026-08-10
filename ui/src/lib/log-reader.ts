/**
 * 读取 auto_run.sh 追加的文本日志（logs/bookmark-auto.log），
 * 供 /api/logs 与 SQLite logs 表合并展示。
 */

import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { getRepoRoot } from "@/lib/repo-root";
import type { LogComponent, LogEntry, LogLevel } from "@/types/api";

const AUTO_LOG_REL = path.join("logs", "bookmark-auto.log");

/** 匹配 [YYYY-MM-DD HH:MM:SS] ... */
const TS_PREFIX =
  /^\[(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})\]\s*(.*)$/;

/** 匹配 [LEVEL] component: message */
const LEVEL_COMPONENT =
  /^\[(INFO|WARN|ERROR|DEBUG|info|warn|error)\]\s*([a-zA-Z0-9_-]+):\s*(.*)$/;

function toIsoTimestamp(raw: string): string {
  // auto_run 日志为本地时间（Asia/Shanghai）
  const normalized = raw.trim().replace(" ", "T");
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(normalized)) return normalized;
  return `${normalized}+08:00`;
}

function normalizeLevel(raw: string): LogLevel {
  const l = raw.toLowerCase();
  if (l === "error") return "error";
  if (l === "warn" || l === "warning") return "warn";
  return "info";
}

function guessComponent(message: string): LogComponent {
  const m = message.toLowerCase();
  if (m.includes("notion") || m.includes("upload_to_notion") || m.includes("step 4")) {
    return "notion_upload";
  }
  if (m.includes("article") || m.includes("rewrite") || m.includes("step 3")) {
    return "article_pipeline";
  }
  if (m.includes("coordinator") || m.includes("deep") || m.includes("step 2")) {
    return "coordinator";
  }
  if (m.includes("sync") || m.includes("rettiwt") || m.includes("step 1")) {
    return "sync";
  }
  return "system";
}

function parseLine(line: string, index: number): LogEntry | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const tsMatch = trimmed.match(TS_PREFIX);
  if (!tsMatch) {
    // 无时间戳行（如 [upload_to_notion] ...）——跳过或低优先级忽略
    return null;
  }

  const timestamp = toIsoTimestamp(tsMatch[1]);
  const rest = tsMatch[2] || "";

  let level: LogLevel = "info";
  let component: LogComponent = "system";
  let message = rest;

  const lc = rest.match(LEVEL_COMPONENT);
  if (lc) {
    level = normalizeLevel(lc[1]);
    // 文件日志 component 映射到合法枚举；未知则 system
    const rawComp = lc[2].toLowerCase();
    const allowed: LogComponent[] = [
      "sync",
      "x-reader",
      "x-tweet-reader",
      "agent",
      "system",
      "coordinator",
      "article_pipeline",
      "notion_upload",
    ];
    component = (allowed.includes(rawComp as LogComponent)
      ? rawComp
      : guessComponent(lc[3])) as LogComponent;
    message = lc[3];
  } else {
    // 常见格式：[ts] Step N: ...
    if (/error|失败|failed/i.test(rest)) level = "error";
    else if (/warn|警告/i.test(rest)) level = "warn";
    component = guessComponent(rest);
    message = rest;
  }

  // 稳定 id：文件路径 + 行序 + 时间戳哈希前缀
  const id = `file_auto_${timestamp}_${index}`;
  return { id, component, level, message, timestamp };
}

/** tail -n N 读取 bookmark-auto.log 并解析为 LogEntry[]（新→旧） */
export function readBookmarkAutoLog(maxLines: number = 500): LogEntry[] {
  const logPath = path.join(getRepoRoot(), AUTO_LOG_REL);
  if (!fs.existsSync(logPath)) return [];

  let text = "";
  try {
    // 优先用 tail，大文件更省内存
    text = execFileSync("tail", ["-n", String(maxLines), logPath], {
      encoding: "utf-8",
      timeout: 5000,
      maxBuffer: 4 * 1024 * 1024,
    });
  } catch {
    try {
      const full = fs.readFileSync(logPath, "utf-8");
      const lines = full.split("\n");
      text = lines.slice(-maxLines).join("\n");
    } catch {
      return [];
    }
  }

  const entries: LogEntry[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const e = parseLine(lines[i], i);
    if (e) entries.push(e);
  }
  // 文件顺序旧→新，统一为新→旧
  entries.reverse();
  return entries;
}

/**
 * 合并 DB 日志与文件日志：按 timestamp 倒序，按 timestamp+message 去重（DB 优先）。
 */
export function mergeLogEntries(
  dbItems: LogEntry[],
  fileItems: LogEntry[],
  component?: LogComponent,
  level?: LogLevel
): LogEntry[] {
  const seen = new Set<string>();
  const out: LogEntry[] = [];

  const push = (e: LogEntry) => {
    if (component && e.component !== component) return;
    if (level && e.level !== level) return;
    const key = `${e.timestamp}|${e.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(e);
  };

  // DB 优先（保留真实 id）
  for (const e of dbItems) push(e);
  for (const e of fileItems) push(e);

  out.sort((a, b) => {
    const ta = new Date(a.timestamp).getTime();
    const tb = new Date(b.timestamp).getTime();
    return tb - ta;
  });
  return out;
}
