"use client";

/**
 * SyncTerminal — Terminal-style log output
 */

import { useRef, useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";

interface SyncTerminalProps {
  logs: string[];
}

function parseLogColor(log: string): React.ReactNode {
  // Detect log levels and color them
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

export function SyncTerminal({ logs }: SyncTerminalProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(logs.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border border-border bg-[#1e1e1e] overflow-hidden">
      <div className="flex items-center justify-between border-b border-[#333] px-3 py-1.5">
        <span className="text-[11px] text-gray-400 font-mono">sync.log</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-white transition-colors"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="max-h-[300px] overflow-y-auto p-3 font-mono text-xs leading-relaxed space-y-0.5">
        {logs.length === 0 ? (
          <p className="text-gray-500 italic">No logs yet...</p>
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
