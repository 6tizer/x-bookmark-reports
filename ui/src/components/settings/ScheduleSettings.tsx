"use client";

/**
 * ScheduleSettings — Cron expression editor
 */

import { useState, useEffect } from "react";
import { Save, Clock } from "lucide-react";
import type { Settings, UpdateSettingsRequest } from "@/types/api";

const presetSchedules = [
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Every 12 hours", value: "0 */12 * * *" },
  { label: "Daily at midnight", value: "0 0 * * *" },
  { label: "Daily at 8am", value: "0 8 * * *" },
  { label: "Weekly (Sunday)", value: "0 0 * * 0" },
];

interface ScheduleSettingsProps {
  settings: Settings | null;
  isSaving: boolean;
  onSave: (request: UpdateSettingsRequest) => Promise<void>;
}

export function ScheduleSettings({ settings, isSaving, onSave }: ScheduleSettingsProps) {
  const [cron, setCron] = useState("0 */6 * * *");
  const [isValid, setIsValid] = useState(true);

  useEffect(() => {
    if (settings?.cronExpression) {
      setCron(settings.cronExpression);
    }
  }, [settings]);

  const validateCron = (value: string): boolean => {
    const parts = value.trim().split(/\s+/);
    return parts.length === 5;
  };

  const handleChange = (value: string) => {
    setCron(value);
    setIsValid(validateCron(value));
  };

  const handleSave = () => {
    if (isValid) {
      onSave({ cronExpression: cron });
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-twitter-blue" />
          <h3 className="text-sm font-semibold text-foreground">Sync Schedule</h3>
        </div>

        <p className="text-xs text-muted-foreground">
          Use cron expression format: <code className="bg-muted px-1 rounded">min hour day month weekday</code>
        </p>

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
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={isSaving || !isValid}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          <Save size={14} />
          {isSaving ? "Saving..." : "Save Schedule"}
        </button>
      </div>
    </div>
  );
}
