"use client";

/**
 * GeneralSettings — General app settings form
 */

import { useState, useEffect } from "react";
import { Save, RotateCcw } from "lucide-react";
import type { Settings, UpdateSettingsRequest } from "@/types/api";

interface GeneralSettingsProps {
  settings: Settings | null;
  isLoading: boolean;
  isSaving: boolean;
  onSave: (request: UpdateSettingsRequest) => Promise<void>;
}

export function GeneralSettings({ settings, isLoading, isSaving, onSave }: GeneralSettingsProps) {
  const [proxy, setProxy] = useState("");
  const [dataPath, setDataPath] = useState("");
  const [autoSync, setAutoSync] = useState(false);

  useEffect(() => {
    if (settings) {
      setProxy(settings.proxy || "");
      setDataPath(settings.dataPath || "./data");
      setAutoSync(settings.autoSync);
    }
  }, [settings]);

  const handleSave = () => {
    onSave({
      proxy: proxy || null,
      dataPath,
      autoSync,
    });
  };

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div className="h-4 w-32 bg-muted rounded animate-pulse" />
        <div className="h-9 w-full bg-muted rounded animate-pulse" />
        <div className="h-9 w-full bg-muted rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">General</h3>

        {/* Proxy */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Proxy URL</label>
          <input
            type="text"
            value={proxy}
            onChange={(e) => setProxy(e.target.value)}
            placeholder="http://127.0.0.1:7897"
            className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* Data Path */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Data Directory</label>
          <input
            type="text"
            value={dataPath}
            onChange={(e) => setDataPath(e.target.value)}
            placeholder="./data"
            className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* Auto Sync */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Auto Sync</p>
            <p className="text-[11px] text-muted-foreground">Automatically sync bookmarks on schedule</p>
          </div>
          <button
            onClick={() => setAutoSync(!autoSync)}
            className={`relative h-5 w-9 rounded-full transition-colors ${
              autoSync ? "bg-twitter-blue" : "bg-muted"
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                autoSync ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          <Save size={14} />
          {isSaving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
