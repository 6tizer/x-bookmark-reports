"use client";

/**
 * HealthBanner — 顶部健康警告条（PR-5）
 * 每 60s 轮询 /api/health，仅在有 warnings 时渲染
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, X } from "lucide-react";

interface HealthResp {
  healthy: boolean;
  recentFailStreak: number;
  suggestNetworkFix?: boolean;
  warnings: string[];
}

export function HealthBanner() {
  const [warnings, setWarnings] = useState<string[]>([]);
  const [failStreak, setFailStreak] = useState(0);
  const [suggestNetworkFix, setSuggestNetworkFix] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/health");
        const json = (await res.json()) as { success: boolean; data?: HealthResp };
        if (!cancelled && json.success && json.data) {
          setWarnings(json.data.warnings ?? []);
          setFailStreak(json.data.recentFailStreak ?? 0);
          setSuggestNetworkFix(json.data.suggestNetworkFix ?? false);
        }
      } catch { /* 静默，不因 health 端点失败打扰用户 */ }
    };
    void poll();
    const timer = setInterval(poll, 60_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  if (dismissed || warnings.length === 0) return null;

  // 连续失败 ≥3 次或流水线停摆/网络不可用时红色，否则黄色
  const isCritical = failStreak >= 3 || suggestNetworkFix;

  return (
    <div className={`flex items-start gap-2 px-4 py-2 text-xs ${
      isCritical
        ? "bg-red-50 text-red-700 border-b border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900"
        : "bg-yellow-50 text-yellow-800 border-b border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-900"
    }`}>
      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
      <div className="flex-1 space-y-0.5">
        {warnings.map((w, i) => (
          <p key={i}>{w}</p>
        ))}
        {suggestNetworkFix && (
          <p>
            <Link href="/settings" className="font-medium underline underline-offset-2">
              去设置页「一键检测并修复网络」→
            </Link>
          </p>
        )}
      </div>
      <button type="button" onClick={() => setDismissed(true)} className="shrink-0 opacity-60 hover:opacity-100" title="本次会话内忽略">
        <X size={14} />
      </button>
    </div>
  );
}
