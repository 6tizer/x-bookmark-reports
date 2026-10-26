"use client";

/**
 * NetworkDoctorCard — 一键检测并修复网络
 * 调 POST /api/network/doctor：依次探测 .env 代理 / 上次可用 / 系统代理 / 本机 Clash 等常见端口 / 直连，
 * 选出能同时访问 X 与 Notion 的路径写入 cache/network_profile.json，流水线下一次运行即生效。
 * 候选名 / 结果 / 提示按 source、detail_code、hint_codes 走 network 词典渲染；旧档案缺字段时回退中文原文。
 */

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Stethoscope, XCircle } from "lucide-react";
import { formatDateTime } from "@/lib/format-date";
import { hasMessage, useI18n, type MessageKey, type TFunction, type TranslateVars } from "@/lib/i18n";
import type { ApiResponse, NetworkCandidate, NetworkProfile } from "@/types/api";

const MODE_BADGE: Record<NetworkProfile["mode"], { key: MessageKey; cls: string }> = {
  proxy: { key: "network.ui.mode.proxy", cls: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300" },
  direct: { key: "network.ui.mode.direct", cls: "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300" },
  offline: { key: "network.ui.mode.offline", cls: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300" },
};

/** 候选名：词典有 source.<source> 就按当前语言渲染；没有该键或旧档案缺 label_params（占位符没填上）时回退后端给的 label */
function sourceLabel(t: TFunction, source: string | null | undefined, params: TranslateVars | undefined, fallback: string) {
  if (!source) return fallback;
  const key = `network.source.${source}`;
  if (!hasMessage(key)) return fallback;
  const text = t(key as MessageKey, params);
  return /\{\w+\}/.test(text) ? fallback : text;
}

/** 结果说明：按 detail_code 渲染，unreachable 时把不可达目标按当前语言的分隔符拼接 */
function candidateDetail(t: TFunction, c: NetworkCandidate, separator: string) {
  if (!c.detail_code) return c.detail;
  if (c.detail_code === "unreachable") {
    return t("network.detail.unreachable", { targets: (c.failed ?? []).join(separator) });
  }
  return t(`network.detail.${c.detail_code}` as MessageKey);
}

interface DoctorError {
  code: string | null;
  text: string;
}

export function NetworkDoctorCard() {
  const { t, locale } = useI18n();
  const [profile, setProfile] = useState<NetworkProfile | null>(null);
  const [customProxy, setCustomProxy] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<DoctorError | null>(null);
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
        setError({ code: json.error?.code ?? null, text: json.error?.detail || json.error?.message || "" });
        return;
      }
      setProfile(json.data);
      setJustRan(true);
    } catch (e) {
      setError({ code: null, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setRunning(false);
    }
  };

  const separator = locale === "zh" ? "、" : ", ";
  const badge = profile ? MODE_BADGE[profile.mode] : null;

  // 当前选用路径的名称：从候选里找同 source + proxy 的那条拿 label_params
  const chosenCandidate = profile?.candidates.find((c) => c.source === profile.source && c.proxy === profile.proxy);
  const chosenLabel = profile?.label
    ? sourceLabel(t, profile.source, chosenCandidate?.label_params, profile.label)
    : null;

  const hintTexts: string[] = profile
    ? profile.hint_codes
      ? profile.hint_codes.map(({ code, params }) => {
          if (code === "chosen_proxy") {
            const { source, ...labelParams } = params;
            const fallback =
              profile.candidates.find((c) => c.source === source && c.proxy === params.proxy)?.label ?? String(source ?? "");
            const label = sourceLabel(t, source != null ? String(source) : null, labelParams, fallback);
            return t("network.hint.chosen_proxy", { ...params, label });
          }
          const key = `network.hint.${code}`;
          return hasMessage(key) ? t(key as MessageKey, params) : code;
        })
      : profile.hints
    : [];

  const errorDetail = error?.code === "INVALID_PROXY" ? t("network.ui.invalidProxy") : error?.text;
  const errorText = error ? (errorDetail ? t("network.ui.error", { error: errorDetail }) : t("network.ui.failed")) : null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-foreground">{t("network.ui.title")}</h3>
        {profile && (
          <span className="text-[10px] text-muted-foreground/70">
            {t("network.ui.lastChecked", { time: formatDateTime(profile.checked_at) })}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-xs text-muted-foreground">{t("network.ui.current")}</span>
        {badge ? (
          <>
            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${badge.cls}`}>{t(badge.key)}</span>
            {profile?.proxy && <span className="font-mono text-xs">{profile.proxy}</span>}
            {chosenLabel && (
              <span className="text-xs text-muted-foreground">{t("network.ui.labelParen", { label: chosenLabel })}</span>
            )}
          </>
        ) : (
          <span className="text-xs text-muted-foreground">{t("network.ui.notChecked")}</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={customProxy}
          onChange={(e) => setCustomProxy(e.target.value)}
          placeholder={t("network.ui.placeholder")}
          className="min-w-[260px] flex-1 rounded-md border border-border bg-muted px-3 py-1.5 text-sm font-mono outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          type="button"
          onClick={runDoctor}
          disabled={running}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {running ? <Loader2 size={14} className="animate-spin" /> : <Stethoscope size={14} />}
          {running ? t("network.ui.running") : t("network.ui.run")}
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">{t("network.ui.description")}</p>

      {errorText && <p className="text-xs text-red-600 dark:text-red-400">{errorText}</p>}

      {profile && hintTexts.length > 0 && (
        <ul className="space-y-0.5 rounded-md bg-muted/60 px-3 py-2 text-xs text-foreground">
          {justRan && (
            <li className="font-medium">
              {profile.mode === "offline" ? t("network.ui.noPath") : t("network.ui.fixed")}
            </li>
          )}
          {hintTexts.map((h, i) => (
            <li key={i}>· {h}</li>
          ))}
        </ul>
      )}

      {profile && profile.candidates.length > 0 && (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 font-medium">{t("network.ui.col.candidate")}</th>
              <th className="py-1 font-medium">{t("network.ui.col.address")}</th>
              <th className="py-1 font-medium">{t("network.ui.col.result")}</th>
              <th className="py-1 font-medium text-right">{t("network.ui.col.latency")}</th>
            </tr>
          </thead>
          <tbody>
            {profile.candidates.map((c) => (
              <tr key={`${c.source}-${c.proxy ?? "direct"}`} className="border-t border-border/60">
                <td className="py-1 pr-2">{sourceLabel(t, c.source, c.label_params, c.label)}</td>
                <td className="py-1 pr-2 font-mono">{c.proxy ?? "—"}</td>
                <td className="py-1 pr-2">
                  <span className="inline-flex items-center gap-1">
                    {c.ok ? (
                      <CheckCircle2 size={12} className="text-green-600" />
                    ) : (
                      <XCircle size={12} className="text-red-500" />
                    )}
                    {candidateDetail(t, c, separator)}
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
