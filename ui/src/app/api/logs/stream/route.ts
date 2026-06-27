/**
 * GET /api/logs/stream
 * SSE endpoint — 推送 DB logs 表中自 since 以来的新增行给前端 SyncTerminal。
 * 每 1 秒轮询一次 listLogsSince，60 秒后自动关闭避免长连接堆积。
 *
 * Query params:
 *   component — 可选，过滤 logs.component（未提供则只推送 connected 帧）
 *   since     — 可选，ISO timestamp，默认 30s 前
 *   limit     — 可选，每次推送最多 N 条，默认 200
 *
 * 帧格式（标准 SSE，data 字段为 JSON）：
 *   data: {"type":"connected","since":"..."}             \n\n   启动时立即推送
 *   data: {"type":"log","id":...,"timestamp":...,...}    \n\n   每条新日志
 *   data: {"type":"closed","reason":"timeout_60s"}       \n\n   60s 到期
 *   data: {"type":"error","message":"..."}               \n\n   出错后关闭
 */

import { listLogsSince } from "@/lib/db";
import type { LogComponent, LogLevel } from "@/types/api";

// 必须用 Node.js runtime：SSE 长连接 + better-sqlite3 同步驱动需要 Node
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_SINCE_MS = 30_000; // 默认查询 30 秒以来的日志
const POLL_INTERVAL_MS = 1_000; // 每 1 秒轮询一次 DB
const MAX_LIFETIME_MS = 60_000; // 60 秒自动关闭，避免长连接堆积
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

interface SSEFrame {
  type: "connected" | "log" | "closed" | "error";
  // connected 帧
  since?: string;
  // log 帧
  id?: string;
  timestamp?: string;
  component?: string;
  level?: LogLevel;
  message?: string; // log 帧为日志内容；error 帧为错误描述
  detail?: string;
  // closed 帧
  reason?: string;
}

/** 把对象序列化为 SSE data: 行 */
function serialize(frame: SSEFrame): string {
  return `data: ${JSON.stringify(frame)}\n\n`;
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const componentRaw = searchParams.get("component");
  const component = (componentRaw as LogComponent | null) ?? undefined;
  const sinceParam = searchParams.get("since");
  const limitParam = parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10);
  const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : DEFAULT_LIMIT, 1), MAX_LIMIT);

  // since 默认 30s 前；客户端可传 startedAt 覆盖
  const initialSince = sinceParam ?? new Date(Date.now() - DEFAULT_SINCE_MS).toISOString();
  let sinceIso = initialSince;

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let intervalId: ReturnType<typeof setInterval> | null = null;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const safeEnqueue = (chunk: string): boolean => {
        if (closed) return false;
        try {
          controller.enqueue(encoder.encode(chunk));
          return true;
        } catch {
          // controller 已关闭或出错
          return false;
        }
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (intervalId) clearInterval(intervalId);
        if (timeoutId) clearTimeout(timeoutId);
        try {
          controller.close();
        } catch {
          /* 已关闭 */
        }
      };

      // 1) 启动时立即推送 connected meta 帧
      safeEnqueue(serialize({ type: "connected", since: sinceIso }));

      // 2) 60 秒后自动关闭连接（客户端可重连）
      timeoutId = setTimeout(() => {
        safeEnqueue(serialize({ type: "closed", reason: "timeout_60s" }));
        cleanup();
      }, MAX_LIFETIME_MS);

      // 3) 每 1 秒轮询 DB，推送新日志行
      intervalId = setInterval(() => {
        if (closed) return;
        // 没有 component 过滤则不查询（listLogsSince 必填 component）
        if (!component) return;

        try {
          const rows = listLogsSince(component, sinceIso, limit);
          if (rows.length === 0) return;

          // rows 按 id DESC 返回（最新在前），转成正序推送
          const sorted = rows.slice().reverse();
          for (const row of sorted) {
            const ok = safeEnqueue(
              serialize({
                type: "log",
                id: row.id,
                timestamp: row.timestamp,
                component: row.component,
                level: row.level,
                message: row.message,
                detail: row.detail,
              })
            );
            if (!ok) return;
          }
          // 推送后更新 sinceIso 为最新一行的 timestamp，避免重复推送
          sinceIso = sorted[sorted.length - 1].timestamp;
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          safeEnqueue(serialize({ type: "error", message }));
          cleanup();
        }
      }, POLL_INTERVAL_MS);

      // 4) 客户端断开时清理 interval/timeout
      request.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      // 消费端取消（React 组件 unmount 时 EventSource.close() 触发）
      // ReadableStream cancel 由框架调用，无需在此额外清理（start 里的 abort 会处理）
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // 防止中间代理缓冲 SSE
    },
  });
}
