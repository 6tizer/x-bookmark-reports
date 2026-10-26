"use client";

/**
 * ScheduleSettings — launchd management (presets + load/unload) and last run status
 */

import { useState, useEffect, useCallback } from "react";
import { Clock, Play, Square, Terminal, RefreshCw, CheckCircle, XCircle, Loader2 } from "lucide-react";
import type { Settings, UpdateSettingsRequest } from "@/types/api";
// 统一按产品时区（Asia/Singapore）展示日期
import { formatDateTime } from "@/lib/format-date";
import { useI18n } from "@/lib/i18n";

interface ScheduleSettingsProps {
  settings: Settings | null;
  isSaving: boolean;
  onSave: (request: UpdateSettingsRequest) => Promise<void>;
}

interface ScheduleStatus {
  lastRun: string | null;
  lastRunStatus: string | null;
  lastRunStep: string | null;
  lastRunError: string | null;
  launchdLoaded: boolean;
  launchdPlistPath: string | null;
}

/** launchd GET /api/schedule/launchd 返回的调度信息 */
interface LaunchdScheduleInfo {
  loaded: boolean;
  plistPath: string;
  plistName: string;
  schedule: {
    type: "calendar" | "interval" | "unknown";
    intervals?: Array<{ hour?: number; minute?: number }>;
    seconds?: number;
  };
}

/** launchd 调度预设 — 与后端 PUT /api/schedule/launchd 一致 */
const launchdPresets = [
  { value: "3h", labelKey: "settings.schedule.preset.3h", intervals: [{ hour: 0, minute: 0 }, { hour: 3, minute: 0 }, { hour: 6, minute: 0 }, { hour: 9, minute: 0 }, { hour: 12, minute: 0 }, { hour: 15, minute: 0 }, { hour: 18, minute: 0 }, { hour: 21, minute: 0 }] },
  { value: "6h", labelKey: "settings.schedule.preset.6h", intervals: [{ hour: 0, minute: 0 }, { hour: 6, minute: 0 }, { hour: 12, minute: 0 }, { hour: 18, minute: 0 }] },
  { value: "12h", labelKey: "settings.schedule.preset.12h", intervals: [{ hour: 0, minute: 0 }, { hour: 12, minute: 0 }] },
  { value: "daily-0", labelKey: "settings.schedule.preset.daily-0", intervals: [{ hour: 0, minute: 0 }] },
  { value: "daily-8", labelKey: "settings.schedule.preset.daily-8", intervals: [{ hour: 8, minute: 0 }] },
  { value: "daily-16", labelKey: "settings.schedule.preset.daily-16", intervals: [{ hour: 16, minute: 0 }] },
] as const;

/** 判断某预设是否对应当前 plist 的 intervals（用于高亮） */
function isPresetActive(info: LaunchdScheduleInfo | null, preset: typeof launchdPresets[number]): boolean {
  if (!info || info.schedule.type !== "calendar" || !info.schedule.intervals) return false;
  const cur = info.schedule.intervals.map((i) => `${i.hour ?? 0}:${i.minute ?? 0}`).sort().join("|");
  const want = preset.intervals.map((i) => `${i.hour}:${i.minute}`).sort().join("|");
  return cur === want;
}

export function ScheduleSettings({ settings, isSaving, onSave }: ScheduleSettingsProps) {
  // 保留 settings/isSaving/onSave props（Commit 4 才会清理 GeneralSettings），本 commit 不使用
  void settings;
  void isSaving;
  void onSave;

  const { t, locale } = useI18n();
  const [scheduleStatus, setScheduleStatus] = useState<ScheduleStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [launchdLoading, setLaunchdLoading] = useState(false);
  const [launchdSchedule, setLaunchdSchedule] = useState<LaunchdScheduleInfo | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // 调度预设切换状态：当前正在应用的 preset value（null = 空闲）
  const [applyingPreset, setApplyingPreset] = useState<string | null>(null);
  // 预设切换后展示的提示消息（成功 / 失败）
  const [presetMessage, setPresetMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 拉取 launchd plist 调度配置（GET /api/schedule/launchd） */
  const fetchLaunchdSchedule = useCallback(async () => {
    try {
      const res = await fetch("/api/schedule/launchd");
      const data = await res.json();
      if (data.success && data.data) {
        setLaunchdSchedule(data.data);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const [statusRes] = await Promise.all([
        fetch("/api/schedule/status"),
        fetchLaunchdSchedule(),
      ]);
      const data = await statusRes.json();
      if (data.success && data.data) {
        setScheduleStatus(data.data);
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingStatus(false);
    }
  }, [fetchLaunchdSchedule]);

  const handleLaunchd = async (action: "load" | "unload") => {
    setLaunchdLoading(true);
    try {
      const res = await fetch("/api/schedule/launchd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage(data.data.message);
        await fetchStatus();
      } else {
        setMessage(data.error?.message || t("settings.schedule.launchdFailed"));
      }
    } catch {
      setMessage(t("settings.schedule.launchdManageFailed"));
    } finally {
      setLaunchdLoading(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  /** 应用调度预设（PUT /api/schedule/launchd），成功后刷新 schedule 显示 */
  const handleApplyPreset = async (preset: string) => {
    setApplyingPreset(preset);
    setPresetMessage(null);
    try {
      const res = await fetch("/api/schedule/launchd", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preset }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setLaunchdSchedule(data.data);
        const found = launchdPresets.find((p) => p.value === preset);
        const label = found ? t(found.labelKey) : preset;
        setPresetMessage(t("settings.schedule.switched", { label }));
        // 同步刷新 status（loaded 状态可能因 reload 变化）
        void fetchStatus();
      } else {
        setPresetMessage(
          t("settings.schedule.switchFailed", { error: data.error?.message ?? t("settings.schedule.unknownError") })
        );
      }
    } catch (err) {
      setPresetMessage(
        t("settings.schedule.switchError", {
          error: err instanceof Error ? err.message : t("settings.schedule.unknownError"),
        })
      );
    } finally {
      setApplyingPreset(null);
      setTimeout(() => setPresetMessage(null), 4000);
    }
  };

  const formatTime = (iso: string | null) => {
    if (!iso) return t("settings.schedule.never");
    return formatDateTime(iso, iso);
  };

  /** 上次运行状态：已知状态走通用词典，其余原样显示 */
  const formatRunStatus = (status: string | null): string => {
    if (status === "success") return t("common.status.success");
    if (status === "failed") return t("common.status.failed");
    if (status === "running") return t("common.status.running");
    return status || t("settings.schedule.unknown");
  };

  /** 将 launchd schedule 格式化为当前语言的可读描述 */
  const formatLaunchdSchedule = (info: LaunchdScheduleInfo | null): string => {
    if (!info) return t("common.status.loading");
    const { schedule } = info;
    if (schedule.type === "interval" && schedule.seconds != null) {
      const hours = (schedule.seconds / 3600).toFixed(1).replace(/\.0$/, "");
      return t("settings.schedule.everySeconds", { seconds: schedule.seconds, hours });
    }
    if (schedule.type === "calendar" && schedule.intervals?.length) {
      const points = schedule.intervals.map((iv) => {
        const h = String(iv.hour ?? 0).padStart(2, "0");
        const m = String(iv.minute ?? 0).padStart(2, "0");
        return `${h}:${m}`;
      });
      return t("settings.schedule.triggerPoints", { points: points.join(locale === "zh" ? "、" : ", ") });
    }
    return t("settings.schedule.unrecognized");
  };

  return (
    <div className="space-y-6">
      {/* Last Run Status */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-twitter-blue" />
            <h3 className="text-sm font-semibold text-foreground">{t("settings.schedule.lastRun")}</h3>
          </div>
          <button
            onClick={fetchStatus}
            disabled={loadingStatus}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw size={11} className={loadingStatus ? "animate-spin" : ""} />
            {t("common.action.refresh")}
          </button>
        </div>

        {scheduleStatus?.lastRun ? (
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-muted-foreground">{t("settings.schedule.time")}</p>
              <p className="font-mono text-foreground">{formatTime(scheduleStatus.lastRun)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t("settings.schedule.status")}</p>
              <div className="flex items-center gap-1">
                {scheduleStatus.lastRunStatus === "success" ? (
                  <CheckCircle size={12} className="text-green-500" />
                ) : scheduleStatus.lastRunStatus === "failed" ? (
                  <XCircle size={12} className="text-red-500" />
                ) : (
                  <Loader2 size={12} className="text-yellow-500 animate-spin" />
                )}
                <span className="capitalize">{formatRunStatus(scheduleStatus.lastRunStatus)}</span>
              </div>
            </div>
            {scheduleStatus.lastRunStep && (
              <div>
                <p className="text-muted-foreground">{t("settings.schedule.step")}</p>
                <p className="font-mono">{scheduleStatus.lastRunStep}</p>
              </div>
            )}
            {scheduleStatus.lastRunError && (
              <div className="col-span-2">
                <p className="text-muted-foreground">{t("settings.schedule.error")}</p>
                <p className="text-red-500 text-[11px] font-mono break-all">{scheduleStatus.lastRunError}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t("settings.schedule.noRuns")}</p>
        )}
      </div>

      {/* launchd Management */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Terminal size={16} className="text-twitter-blue" />
          <h3 className="text-sm font-semibold text-foreground">{t("settings.schedule.launchdTitle")}</h3>
        </div>
        <p className="text-[11px] text-muted-foreground">{t("settings.schedule.launchdDesc")}</p>

        {/* 当前调度（只读） */}
        {(launchdSchedule?.plistPath || scheduleStatus?.launchdPlistPath) && (
          <div className="text-[11px] text-muted-foreground font-mono">
            {t("settings.schedule.plistPath", {
              path: launchdSchedule?.plistPath ?? scheduleStatus?.launchdPlistPath ?? "",
            })}
          </div>
        )}
        <div className="text-[11px]">
          <span className="text-muted-foreground">{t("settings.schedule.current")}</span>
          <span className="text-foreground">{formatLaunchdSchedule(launchdSchedule)}</span>
        </div>

        {/* 6 个预设按钮 — 调用 PUT /api/schedule/launchd 切换调度 */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">{t("settings.schedule.switchTitle")}</p>
          <div className="flex flex-wrap gap-2">
            {launchdPresets.map((preset) => {
              const isActive = isPresetActive(launchdSchedule, preset);
              const isApplyingThis = applyingPreset === preset.value;
              return (
                <button
                  key={preset.value}
                  type="button"
                  disabled={applyingPreset !== null}
                  onClick={() => handleApplyPreset(preset.value)}
                  title={t("settings.schedule.switchTo", { label: t(preset.labelKey) })}
                  className={`flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] transition-colors disabled:opacity-50 ${
                    isActive
                      ? "bg-twitter-blue text-white border-twitter-blue"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  {isApplyingThis && <Loader2 size={10} className="animate-spin" />}
                  {isApplyingThis ? t("settings.schedule.applying") : t(preset.labelKey)}
                </button>
              );
            })}
          </div>
          {presetMessage && (
            <p className="text-[11px] text-muted-foreground mt-1">{presetMessage}</p>
          )}
        </div>

        {/* Status + Load/Unload */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">{t("settings.schedule.launchdStatus")}</span>
            <span className={scheduleStatus?.launchdLoaded ? "text-green-500" : "text-muted-foreground"}>
              {scheduleStatus?.launchdLoaded ? t("settings.schedule.loaded") : t("settings.schedule.notLoaded")}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleLaunchd("load")}
              disabled={launchdLoading || scheduleStatus?.launchdLoaded === true}
              className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[11px] hover:bg-muted disabled:opacity-50 transition-colors"
            >
              <Play size={10} />
              {t("settings.schedule.load")}
            </button>
            <button
              onClick={() => handleLaunchd("unload")}
              disabled={launchdLoading || scheduleStatus?.launchdLoaded === false}
              className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[11px] hover:bg-muted disabled:opacity-50 transition-colors"
            >
              <Square size={10} />
              {t("settings.schedule.unload")}
            </button>
          </div>
        </div>

        {/* Pipeline Steps — 与 auto_run.sh 实际执行顺序保持一致 */}
        <div className="rounded-md bg-muted p-3">
          <p className="text-[10px] text-muted-foreground mb-2 font-medium">{t("settings.schedule.pipelineSteps")}</p>
          <ol className="text-[11px] text-muted-foreground space-y-1 font-mono">
            <li>1. sync_bookmarks.sh // {t("settings.schedule.pipeline.sync")}</li>
            <li>2. coordinator.py --deep-batch // {t("settings.schedule.pipeline.deep")}</li>
            <li>3. article_pipeline.py run-batch --resume // {t("settings.schedule.pipeline.article")}</li>
            <li>4. upload_to_notion.py --mode finished --live // {t("settings.schedule.pipeline.upload")}</li>
          </ol>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 px-3 py-2 text-xs text-blue-700 dark:text-blue-400">
          {message}
        </div>
      )}
    </div>
  );
}
