"use client";

/**
 * ScheduleSettings — Cron editor, built-in timer, launchd management, last run status
 */

import { useState, useEffect, useCallback } from "react";
import { Save, Clock, Play, Square, Terminal, RefreshCw, CheckCircle, XCircle, Loader2 } from "lucide-react";
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
  builtInTimerEnabled: boolean;
  builtInTimerCron: string | null;
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

const presetSchedules = [
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Every 12 hours", value: "0 */12 * * *" },
  { label: "Daily at midnight", value: "0 0 * * *" },
  { label: "Daily at 8am", value: "0 8 * * *" },
  { label: "Daily at 4pm", value: "0 16 * * *" },
  { label: "Weekly (Sunday)", value: "0 0 * * 0" },
];

export function ScheduleSettings({ settings, isSaving, onSave }: ScheduleSettingsProps) {
  const [cron, setCron] = useState("0 */6 * * *");
  const [isValid, setIsValid] = useState(true);
  const [scheduleStatus, setScheduleStatus] = useState<ScheduleStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [togglingTimer, setTogglingTimer] = useState(false);
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [launchdLoading, setLaunchdLoading] = useState(false);
  const [launchdSchedule, setLaunchdSchedule] = useState<LaunchdScheduleInfo | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (settings?.cronExpression) {
      setCron(settings.cronExpression);
    }
    fetchStatus();
  }, [settings?.cronExpression]);

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
        setTimerEnabled(data.data.builtInTimerEnabled);
        if (data.data.builtInTimerCron) {
          setCron(data.data.builtInTimerCron);
        }
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingStatus(false);
    }
  }, [fetchLaunchdSchedule]);

  const validateCron = (value: string): boolean => {
    const parts = value.trim().split(/\s+/);
    return parts.length === 5;
  };

  const handleChange = (value: string) => {
    setCron(value);
    setIsValid(validateCron(value));
  };

  const handleSaveCron = () => {
    if (isValid) {
      onSave({ cronExpression: cron });
    }
  };

  const handleToggleTimer = async () => {
    setTogglingTimer(true);
    try {
      const res = await fetch("/api/schedule/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !timerEnabled, cronExpression: cron }),
      });
      const data = await res.json();
      if (data.success) {
        setTimerEnabled(data.data.enabled);
        setMessage(timerEnabled ? "Timer disabled" : `Timer enabled: ${cron}`);
      }
    } catch {
      setMessage("Failed to toggle timer");
    } finally {
      setTogglingTimer(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

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

      {/* Built-in Timer */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Built-in Timer</h3>
            <p className="text-[11px] text-muted-foreground">
              Runs the full pipeline (sync → articles → Notion) when the dashboard is open
            </p>
          </div>
          <button
            onClick={handleToggleTimer}
            disabled={togglingTimer}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              timerEnabled
                ? "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-950 dark:text-red-400"
                : "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-950 dark:text-green-400"
            }`}
          >
            {togglingTimer ? (
              <Loader2 size={12} className="animate-spin" />
            ) : timerEnabled ? (
              <Square size={12} />
            ) : (
              <Play size={12} />
            )}
            {timerEnabled ? "Disable" : "Enable"}
          </button>
        </div>

        {/* Presets */}
        <div className="flex flex-wrap gap-2">
          {presetSchedules.map((preset) => (
            <button
              key={preset.value}
              onClick={() => handleChange(preset.value)}
              className={`rounded-md border border-border px-2.5 py-1 text-[11px] transition-colors ${
                cron === preset.value
                  ? "bg-twitter-blue text-white border-twitter-blue"
                  : "hover:bg-muted"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Cron input */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Cron Expression</label>
          <input
            type="text"
            value={cron}
            onChange={(e) => handleChange(e.target.value)}
            className={`w-full rounded-md border px-3 py-2 text-sm font-mono outline-none focus:ring-1 focus:ring-ring ${
              isValid
                ? "border-border bg-muted"
                : "border-red-300 bg-red-50 dark:bg-red-950/30"
            }`}
            placeholder="0 */6 * * *"
          />
          {!isValid && (
            <p className="text-[11px] text-red-500">Invalid cron expression. Must have 5 fields.</p>
          )}
        </div>

        {/* Visual breakdown */}
        {isValid && (
          <div className="rounded-md bg-muted p-3">
            <div className="grid grid-cols-5 gap-2 text-center">
              {cron.split(/\s+/).map((part, i) => (
                <div key={i}>
                  <p className="text-[10px] text-muted-foreground uppercase">
                    {["min", "hour", "day", "month", "weekday"][i]}
                  </p>
                  <p className="text-sm font-mono font-medium text-foreground">{part}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={handleSaveCron}
            disabled={isSaving || !isValid}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Save size={14} />
            {isSaving ? "Saving..." : "Save Schedule"}
          </button>
        </div>
      </div>

      {/* launchd Management */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Terminal size={16} className="text-twitter-blue" />
          <h3 className="text-sm font-semibold text-foreground">macOS launchd</h3>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Manage the system-level scheduled task. This runs even when the dashboard is closed.
        </p>

        {(launchdSchedule?.plistPath || scheduleStatus?.launchdPlistPath) && (
          <div className="text-[11px] text-muted-foreground font-mono">
            Plist: {launchdSchedule?.plistPath ?? scheduleStatus?.launchdPlistPath}
          </div>
        )}

        {/* 当前 plist 中的调度配置（只读，编辑留 PR-3） */}
        <div className="text-[11px]">
          <span className="text-muted-foreground">当前调度：</span>
          <span className="text-foreground">{formatLaunchdSchedule(launchdSchedule)}</span>
        </div>

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
            <li>1. sync_bookmarks.sh                       <span className="text-muted-foreground/70">// 拉取新的 Twitter 书签</span></li>
            <li>2. coordinator.py --deep-batch             <span className="text-muted-foreground/70">// 生成深度报告</span></li>
            <li>3. article_pipeline.py run-batch --resume  <span className="text-muted-foreground/70">// 报告改写为成品文章</span></li>
            <li>4. upload_to_notion.py --mode finished --live <span className="text-muted-foreground/70">// 上传到 Notion</span></li>
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
