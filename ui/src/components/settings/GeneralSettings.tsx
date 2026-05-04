"use client";

/**
 * GeneralSettings — General app settings form
 */

import { useState, useEffect } from "react";
import { Save } from "lucide-react";
import type { Settings, UpdateSettingsRequest } from "@/types/api";

interface GeneralSettingsProps {
  settings: Settings | null;
  isLoading: boolean;
  isSaving: boolean;
  onSave: (request: UpdateSettingsRequest) => Promise<void>;
}

const PIPELINE_MODEL_STORAGE = "articlePipelineModel";

const MODEL_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Default (env)" },
  { value: "deepseek-chat", label: "DeepSeek Chat" },
  { value: "deepseek-reasoner", label: "DeepSeek Reasoner" },
  { value: "grok-2-latest", label: "xAI Grok" },
];

export function GeneralSettings({ settings, isLoading, isSaving, onSave }: GeneralSettingsProps) {
  const [proxy, setProxy] = useState("");
  const [dataPath, setDataPath] = useState("");
  const [autoSync, setAutoSync] = useState(false);
  const [pipelineModel, setPipelineModel] = useState("");

  useEffect(() => {
    if (settings) {
      setProxy(settings.proxy || "");
      setDataPath(settings.dataPath || "./data");
      setAutoSync(settings.autoSync);
    }
  }, [settings]);

  useEffect(() => {
    try {
      const v = localStorage.getItem(PIPELINE_MODEL_STORAGE);
      if (v !== null) setPipelineModel(v);
    } catch {
      /* ignore */
    }
  }, []);

  const handleSave = () => {
    onSave({
      proxy: proxy || null,
      dataPath,
      autoSync,
    });
  };

  const persistPipelineModel = (v: string) => {
    setPipelineModel(v);
    try {
      if (v) localStorage.setItem(PIPELINE_MODEL_STORAGE, v);
      else localStorage.removeItem(PIPELINE_MODEL_STORAGE);
    } catch {
      /* ignore */
    }
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

        {/* Article pipeline default model (browser-local; used by Dashboard articles UI) */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Article pipeline — default rewrite model</label>
          <p className="text-[10px] text-muted-foreground">
            Stored in this browser only. Passed to <code className="text-[10px]">bin/article_pipeline.py --model</code> when
            you run the pipeline from the UI. Articles live under <code className="text-[10px]">output/article-final/</code>.
          </p>
          <select
            value={pipelineModel}
            onChange={(e) => persistPipelineModel(e.target.value)}
            className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          >
            {MODEL_OPTIONS.map((o) => (
              <option key={o.value || "default"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* Auto Sync */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Auto Sync</p>
            <p className="text-[11px] text-muted-foreground">Automatically sync bookmarks on schedule</p>
          </div>
          <button
            type="button"
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
          type="button"
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
