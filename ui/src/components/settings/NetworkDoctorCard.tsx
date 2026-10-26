"use client";

/**
 * NetworkDoctorCard — 一键检测并修复网络
 * 调 POST /api/network/doctor：依次探测 .env 代理 / 上次可用 / 系统代理 / 本机 Clash 等常见端口 / 直连，
 * 选出能同时访问 X 与 Notion 的路径写入 cache/network_profile.json，流水线下一次运行即生效。
 */

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Stethoscope, XCircle } from "lucide-react";
import { formatDateTime } from "@/lib/format-date";
import type { ApiResponse, NetworkProfile } from "@/types/api";

const MODE_BADGE: Record<NetworkProfile["mode"], { text: string; cls: string }> = {
  proxy: { text: "代理", cls: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300" },
  direct: { text: "直连", cls: "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300" },
  offline: { text: "不可用", cls: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300" },
};

export function NetworkDoctorCard() {
  const [profile, setProfile] = useState<NetworkProfile | null>(null);
  const [customProxy, setCustomProxy] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justRan, setJustRan] = useState(false);

  useEffect(() => {
    fetch("/api/network/doctor")
      .then((r) => r.json() as Promise<ApiResponse<NetworkProfile | null>>)
      .then((json) => {
        if (json.success) setProfile(json.data);
      })
      .catch(() => {
        /* 读取失败时保持空态，用户仍可点按钮检测 */
      });
  }, []);

  const runDoctor = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/network/doctor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proxy: customProxy.trim() || undefined }),
      });
      const json = (await res.json()) as ApiResponse<NetworkProfile>;
      if (!json.success || !json.data) {
        setError(json.error?.detail || json.error?.message || "检测失败");
        return;
      }
      setProfile(json.data);
      setJustRan(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const badge = profile ? MODE_BADGE[profile.mode] : null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-foreground">网络诊断</h3>
        {profile && (
          <span className="text-[10px] text-muted-foreground/70">
            上次检测 {formatDateTime(profile.checked_at)}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-xs text-muted-foreground">流水线当前网络：</span>
        {badge ? (
          <>
            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${badge.cls}`}>{badge.text}</span>
            {profile?.proxy && <span className="font-mono text-xs">{profile.proxy}</span>}
            {profile?.label && <span className="text-xs text-muted-foreground">（{profile.label}）</span>}
          </>
        ) : (
          <span className="text-xs text-muted-foreground">尚未检测（沿用上方 Proxy URL）</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={customProxy}
          onChange={(e) => setCustomProxy(e.target.value)}
          placeholder="可选：额外试一个代理，如 http://192.168.1.x:7890"
          className="min-w-[260px] flex-1 rounded-md border border-border bg-muted px-3 py-1.5 text-sm font-mono outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          type="button"
          onClick={runDoctor}
          disabled={running}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {running ? <Loader2 size={14} className="animate-spin" /> : <Stethoscope size={14} />}
          {running ? "检测中..." : "一键检测并修复网络"}
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        依次尝试 .env 代理、上次可用的代理、macOS 系统代理、本机 Clash Verge / Clash / Surge / v2rayN 端口和直连，
        自动选用第一个能同时访问 X 与 Notion 的方式；开了 Clash 之类的代理软件后点一次即可切换过去。
      </p>

      {error && <p className="text-xs text-red-600 dark:text-red-400">检测失败：{error}</p>}

      {profile && profile.hints.length > 0 && (
        <ul className="space-y-0.5 rounded-md bg-muted/60 px-3 py-2 text-xs text-foreground">
          {justRan && (
            <li className="font-medium">
              {profile.mode === "offline" ? "没有找到可用的网络路径。" : "已修复：下一次流水线运行将使用此网络。"}
            </li>
          )}
          {profile.hints.map((h, i) => (
            <li key={i}>· {h}</li>
          ))}
        </ul>
      )}

      {profile && profile.candidates.length > 0 && (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 font-medium">候选</th>
              <th className="py-1 font-medium">地址</th>
              <th className="py-1 font-medium">结果</th>
              <th className="py-1 font-medium text-right">耗时</th>
            </tr>
          </thead>
          <tbody>
            {profile.candidates.map((c) => (
              <tr key={`${c.source}-${c.proxy ?? "direct"}`} className="border-t border-border/60">
                <td className="py-1 pr-2">{c.label}</td>
                <td className="py-1 pr-2 font-mono">{c.proxy ?? "—"}</td>
                <td className="py-1 pr-2">
                  <span className="inline-flex items-center gap-1">
                    {c.ok ? (
                      <CheckCircle2 size={12} className="text-green-600" />
                    ) : (
                      <XCircle size={12} className="text-red-500" />
                    )}
                    {c.detail}
                  </span>
                </td>
                <td className="py-1 text-right tabular-nums">{c.latency_ms != null ? `${c.latency_ms}ms` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
