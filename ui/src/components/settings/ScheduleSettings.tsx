"use client";

/**
 * ScheduleSettings — launchd management (presets + load/unload) and last run status
 */

import { useState, useEffect, useCallback } from "react";
import { Clock, Play, Square, Terminal, RefreshCw, CheckCircle, XCircle, Loader2 } from "lucide-react";
import type { Settings, UpdateSettingsRequest } from "@/types/api";

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
  { value: "3h", label: "Every 3 hours", intervals: [{ hour: 0, minute: 0 }, { hour: 3, minute: 0 }, { hour: 6, minute: 0 }, { hour: 9, minute: 0 }, { hour: 12, minute: 0 }, { hour: 15, minute: 0 }, { hour: 18, minute: 0 }, { hour: 21, minute: 0 }] },
  { value: "6h", label: "Every 6 hours", intervals: [{ hour: 0, minute: 0 }, { hour: 6, minute: 0 }, { hour: 12, minute: 0 }, { hour: 18, minute: 0 }] },
  { value: "12h", label: "Every 12 hours", intervals: [{ hour: 0, minute: 0 }, { hour: 12, minute: 0 }] },
  { value: "daily-0", label: "Daily at midnight", intervals: [{ hour: 0, minute: 0 }] },
  { value: "daily-8", label: "Daily at 8am", intervals: [{ hour: 8, minute: 0 }] },
  { value: "daily-16", label: "Daily at 4pm", intervals: [{ hour: 16, minute: 0 }] },
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
        setMessage(data.error?.message || "launchd operation failed");
      }
    } catch {
      setMessage("Failed to manage launchd");
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
        const label = launchdPresets.find((p) => p.value === preset)?.label ?? preset;
        setPresetMessage(`调度已切换：${label}`);
        // 同步刷新 status（loaded 状态可能因 reload 变化）
        void fetchStatus();
      } else {
        setPresetMessage(`切换失败：${data.error?.message ?? "未知错误"}`);
      }
    } catch (err) {
      setPresetMessage(`切换异常：${err instanceof Error ? err.message : "unknown"}`);
    } finally {
      setApplyingPreset(null);
      setTimeout(() => setPresetMessage(null), 4000);
    }
  };

  const formatTime = (iso: string | null) => {
    if (!iso) return "Never";
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  /** 将 launchd schedule 格式化为可读中文描述 */
  const formatLaunchdSchedule = (info: LaunchdScheduleInfo | null): string => {
    if (!info) return "加载中…";
    const { schedule } = info;
    if (schedule.type === "interval" && schedule.seconds != null) {
      const hours = (schedule.seconds / 3600).toFixed(1).replace(/\.0$/, "");
      return `每 ${schedule.seconds} 秒（约 ${hours} 小时）`;
    }
    if (schedule.type === "calendar" && schedule.intervals?.length) {
      const points = schedule.intervals.map((iv) => {
        const h = String(iv.hour ?? 0).padStart(2, "0");
        const m = String(iv.minute ?? 0).padStart(2, "0");
        return `${h}:${m}`;
      });
      return `触发点：${points.join("、")}`;
    }
    return "未识别的调度配置";
  };

  return (
    <div className="space-y-6">
      {/* Last Run Status */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-twitter-blue" />
            <h3 className="text-sm font-semibold text-foreground">Last Run</h3>
          </div>
          <button
            onClick={fetchStatus}
            disabled={loadingStatus}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw size={11} className={loadingStatus ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {scheduleStatus?.lastRun ? (
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-muted-foreground">Time</p>
              <p className="font-mono text-foreground">{formatTime(scheduleStatus.lastRun)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Status</p>
              <div className="flex items-center gap-1">
                {scheduleStatus.lastRunStatus === "success" ? (
                  <CheckCircle size={12} className="text-green-500" />
                ) : scheduleStatus.lastRunStatus === "failed" ? (
                  <XCircle size={12} className="text-red-500" />
                ) : (
                  <Loader2 size={12} className="text-yellow-500 animate-spin" />
                )}
                <span className="capitalize">{scheduleStatus.lastRunStatus || "unknown"}</span>
              </div>
            </div>
            {scheduleStatus.lastRunStep && (
              <div>
                <p className="text-muted-foreground">Step</p>
                <p className="font-mono">{scheduleStatus.lastRunStep}</p>
              </div>
            )}
            {scheduleStatus.lastRunError && (
              <div className="col-span-2">
                <p className="text-muted-foreground">Error</p>
                <p className="text-red-500 text-[11px] font-mono break-all">{scheduleStatus.lastRunError}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No previous runs recorded</p>
        )}
      </div>

      {/* launchd Management */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Terminal size={16} className="text-twitter-blue" />
          <h3 className="text-sm font-semibold text-foreground">macOS launchd 调度</h3>
        </div>
        <p className="text-[11px] text-muted-foreground">
          系统级定时任务，dashboard 关闭时也运行。当前 plist 中配置的触发时间见下表。
        </p>

        {/* 当前调度（只读） */}
        {(launchdSchedule?.plistPath || scheduleStatus?.launchdPlistPath) && (
          <div className="text-[11px] text-muted-foreground font-mono">
            Plist: {launchdSchedule?.plistPath ?? scheduleStatus?.launchdPlistPath}
          </div>
        )}
        <div className="text-[11px]">
          <span className="text-muted-foreground">当前调度：</span>
          <span className="text-foreground">{formatLaunchdSchedule(launchdSchedule)}</span>
        </div>

        {/* 6 个预设按钮 — 调用 PUT /api/schedule/launchd 切换调度 */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">切换调度</p>
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
                  title={`切换到 ${preset.label}`}
                  className={`flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] transition-colors disabled:opacity-50 ${
                    isActive
                      ? "bg-twitter-blue text-white border-twitter-blue"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  {isApplyingThis && <Loader2 size={10} className="animate-spin" />}
                  {isApplyingThis ? "应用中…" : preset.label}
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
            <span className="text-muted-foreground">Status:</span>
            <span className={scheduleStatus?.launchdLoaded ? "text-green-500" : "text-muted-foreground"}>
              {scheduleStatus?.launchdLoaded ? "Loaded" : "Not loaded"}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleLaunchd("load")}
              disabled={launchdLoading || scheduleStatus?.launchdLoaded === true}
              className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[11px] hover:bg-muted disabled:opacity-50 transition-colors"
            >
              <Play size={10} />
              Load
            </button>
            <button
              onClick={() => handleLaunchd("unload")}
              disabled={launchdLoading || scheduleStatus?.launchdLoaded === false}
              className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[11px] hover:bg-muted disabled:opacity-50 transition-colors"
            >
              <Square size={10} />
              Unload
            </button>
          </div>
        </div>

        {/* Pipeline Steps — 与 auto_run.sh 实际执行顺序保持一致 */}
        <div className="rounded-md bg-muted p-3">
          <p className="text-[10px] text-muted-foreground mb-2 font-medium">Pipeline steps executed (auto_run.sh):</p>
          <ol className="text-[11px] text-muted-foreground space-y-1 font-mono">
            <li>1. sync_bookmarks.sh // 拉取新的 Twitter 书签</li>
            <li>2. coordinator.py --deep-batch // 生成深度报告</li>
            <li>3. article_pipeline.py run-batch --resume // 报告改写为成品文章</li>
            <li>4. upload_to_notion.py --mode finished --live // 上传到 Notion</li>
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
