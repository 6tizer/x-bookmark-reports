/**
 * Logger Service — Unified logging
 * CONTRACT v1.0
 */

import fs from "fs";
import path from "path";
import type { LogComponent, LogLevel } from "@/types/api";
import { createLog, listLogs } from "./db";
import { getUiPackageRoot } from "@/lib/repo-root";
// 日志文件按产品时区（Asia/Singapore）的日历日切分
import { localDateStamp } from "@/lib/format-date";

const LOG_DIR = path.join(getUiPackageRoot(), "data", "logs");

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

interface LogMessage {
  timestamp: string;
  component: string;
  level: string;
  message: string;
  detail?: string;
}

class Logger {
  private component: LogComponent;

  constructor(component: LogComponent) {
    this.component = component;
  }

  info(message: string, detail?: string): void {
    this.log("info", message, detail);
  }

  warn(message: string, detail?: string): void {
    this.log("warn", message, detail);
  }

  error(message: string, detail?: string): void {
    this.log("error", message, detail);
  }

  private log(level: LogLevel, message: string, detail?: string): void {
    const timestamp = new Date().toISOString();

    // Write to file（按新加坡日历日切分文件，timestamp 本身仍是 UTC ISO）
    const date = localDateStamp(timestamp);
    const logFile = path.join(LOG_DIR, `${date}.log`);
    const line = `[${timestamp}] [${this.component}] [${level.toUpperCase()}] ${message}${detail ? ` | ${detail}` : ""}\n`;
    try {
      fs.appendFileSync(logFile, line);
    } catch (err) {
      console.error("Failed to write log file:", err);
    }

    // Also persist to DB
    try {
      createLog(this.component, level, message, detail);
    } catch (err) {
      console.error("Failed to write log to DB:", err);
    }

    // Console in dev
    if (process.env.NODE_ENV === "development") {
      console.log(`[${this.component}] ${level}: ${message}`);
    }
  }
}

export function getLogger(component: LogComponent): Logger {
  return new Logger(component);
}

export function getRecentLogs(
  component?: LogComponent,
  level?: LogLevel,
  limit = 50
): ReturnType<typeof listLogs> {
  return listLogs(1, limit, component, level);
}

export function getLogsFromFile(
  component?: string,
  level?: string,
  limit = 50
): LogMessage[] {
  const files = fs
    .readdirSync(LOG_DIR)
    .filter((f) => f.endsWith(".log"))
    .sort()
    .reverse();

  const results: LogMessage[] = [];

  for (const file of files) {
    if (results.length >= limit) break;
    const content = fs.readFileSync(path.join(LOG_DIR, file), "utf-8");
    const lines = content.trim().split("\n").reverse();

    for (const line of lines) {
      if (results.length >= limit) break;
      const parsed = parseLogLine(line);
      if (!parsed) continue;
      if (component && parsed.component !== component) continue;
      if (level && parsed.level !== level) continue;
      results.push(parsed);
    }
  }

  return results;
}

function parseLogLine(line: string): LogMessage | null {
  // Format: [2024-01-15T08:30:00.000Z] [component] [LEVEL] message | detail
  const match = line.match(/^\[([^\]]+)\] \[([^\]]+)\] \[([^\]]+)\] (.+)$/);
  if (!match) return null;

  const [, timestamp, component, level, rest] = match;
  const parts = rest.split(" | ");
  return {
    timestamp,
    component,
    level: level.toLowerCase(),
    message: parts[0],
    detail: parts[1],
  };
}
