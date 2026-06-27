/**
 * pipeline-log — 子进程 stdout/stderr 日志级别解析
 * 避免 Python logging 行里 Stats 字典含 'errors':0 / 'deep_failed':0 被误判为 error
 */

import type { LogLevel } from "@/types/api";

/** 从 Python logging 标准格式行解析真实级别，例如 `...,093 [INFO] lib.coordinator: ...` */
export function parseStdoutLogLevel(line: string): LogLevel {
  const bracketMatch = line.match(/\[(DEBUG|INFO|WARNING|WARN|ERROR|CRITICAL)\]/i);
  if (bracketMatch) {
    const tag = bracketMatch[1].toUpperCase();
    if (tag === "ERROR" || tag === "CRITICAL") return "error";
    if (tag === "WARNING" || tag === "WARN") return "warn";
    return "info";
  }
  // 无标准 logging 标签时，仅对明确的异常栈标 error（不用宽泛的 fail/error 子串匹配）
  if (/^Traceback\b|^\s*File "|Exception:|Error:/.test(line)) return "error";
  return "info";
}

/** stderr 一律视为 error */
export function parseStderrLogLevel(): LogLevel {
  return "error";
}
