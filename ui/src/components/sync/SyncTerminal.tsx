"use client";

/**
 * SyncTerminal — Terminal-style log output
 * 通过 SSE 订阅 /api/logs/stream?component=X&since=Y，渲染子进程实时输出。
 * 进程结束（component 变 undefined）时关闭 EventSource 并清空日志。
 */

import { useRef, useEffect, useState } from "react";
import { Copy, Check, Square } from "lucide-react";

interface SyncTerminalProps {
  /** 订阅哪个 component 的 SSE；未设置时只显示空状态 */
  component?: string;
  /** 进程开始时间 ISO，用作 SSE since 参数 */
  startedAt?: string;
  title?: string;
  /** 用户点 Stop 按钮时调用，由父组件清空 currentOperation 触发 SSE 关闭 */
  onStop?: () => void;
}

const MAX_LOGS = 200;

/** 把 SSE 推送的 log 帧格式化为终端展示行：[HH:MM:SS] [LEVEL] message */
function formatLogLine(entry: {
  timestamp?: string;
  level?: string;
  message?: string;
}): string {
  // ISO timestamp 形如 2026-06-27T09:10:11.123Z，截取 HH:MM:SS
  const ts = entry.timestamp ? entry.timestamp.slice(11, 19) : "--:--:--";
  const level = (entry.level ?? "info").toUpperCase();
  return `[${ts}] [${level}] ${entry.message ?? ""}`;
}

function parseLogColor(log: string): React.ReactNode {
  if (log.includes("错误") || log.includes("失败") || log.includes("超时") || log.includes("error") || log.includes("Error")) {
    return <span className="text-red-400">{log}</span>;
  }
  if (log.includes("警告") || log.includes("warn")) {
    return <span className="text-yellow-400">{log}</span>;
  }
  if (log.includes("完成") || log.includes("成功") || log.includes("success")) {
    return <span className="text-green-400">{log}</span>;
  }
  return <span className="text-gray-300">{log}</span>;
}

export function SyncTerminal({ component, startedAt, title, onStop }: SyncTerminalProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  // 内部 state：保留最近 200 条滑动窗口
  const [logs, setLogs] = useState<string[]>([]);

  // 监听 component 变化：订阅 / 关闭 EventSource
  useEffect(() => {
    // 进程未启动：清空日志，不订阅
    if (!component) {
      setLogs([]);
      return;
    }

    // since 参数：用 startedAt，否则默认 30s 前
    const since = startedAt ?? new Date(Date.now() - 30_000).toISOString();
    const url = `/api/logs/stream?component=${encodeURIComponent(component)}&since=${encodeURIComponent(since)}`;

    // 切换 component 时重置日志窗口
    setLogs([]);

    let es: EventSource | null;
    try {
      es = new EventSource(url);
    } catch {
      return;
    }

    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as {
          type?: string;
          timestamp?: string;
          level?: string;
          message?: string;
        };
        // 忽略 meta 帧（connected / closed / error），只渲染 log 帧
        if (data.type && data.type !== "log") return;
        const line = formatLogLine(data);
        setLogs((prev) => {
          const next = [...prev, line];
          // 滑动窗口：保留最近 200 条
          return next.length > MAX_LOGS ? next.slice(next.length - MAX_LOGS) : next;
        });
      } catch {
        /* JSON 解析失败则忽略该帧 */
      }
    };

    // onerror 不主动 close：EventSource 默认会自动重连（60s 服务端关闭后也会触发）

    return () => {
      // 进程结束或组件 unmount：关闭连接
      es?.close();
    };
  }, [component, startedAt]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(logs.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayTitle = title ?? "sync.log";

  return (
    <div className="rounded-lg border border-border bg-[#1e1e1e] overflow-hidden">
      <div className="flex items-center justify-between border-b border-[#333] px-3 py-1.5">
        <span className="text-[11px] text-gray-400 font-mono">{displayTitle}</span>
        <div className="flex items-center gap-3">
          {onStop && component && (
            <button
              onClick={onStop}
              className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-red-400 transition-colors"
              title="停止订阅并清除当前操作"
            >
              <Square size={11} />
              Stop
            </button>
          )}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-white transition-colors"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <div className="max-h-[300px] overflow-y-auto p-3 font-mono text-xs leading-relaxed space-y-0.5">
        {logs.length === 0 ? (
          <p className="text-gray-500 italic">Waiting for pipeline output...</p>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="break-all">
              {parseLogColor(log)}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
