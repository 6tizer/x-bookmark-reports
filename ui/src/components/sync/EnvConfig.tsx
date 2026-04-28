"use client";

/**
 * EnvConfig — .env.twitter config form
 */

import { useState } from "react";
import { Eye, EyeOff, Save, TestTube } from "lucide-react";
import type { Settings, UpdateSettingsRequest } from "@/types/api";

interface EnvConfigProps {
  settings: Settings | null;
  isSaving: boolean;
  onSave: (request: UpdateSettingsRequest) => void;
  onTest: () => Promise<{ reachable: boolean; latency: number }>;
}

export function EnvConfig({ settings, isSaving, onSave, onTest }: EnvConfigProps) {
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [proxy, setProxy] = useState(settings?.proxy || "");
  const [dataPath, setDataPath] = useState(settings?.dataPath || "./data");
  const [testResult, setTestResult] = useState<{ reachable: boolean; latency: number } | null>(null);
  const [testing, setTesting] = useState(false);

  const handleSave = () => {
    const updates: UpdateSettingsRequest = {};
    if (proxy !== (settings?.proxy ?? "")) updates.proxy = proxy || null;
    if (dataPath !== settings?.dataPath) updates.dataPath = dataPath;
    onSave(updates);
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const result = await onTest();
      setTestResult(result);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <h2 className="text-sm font-semibold text-foreground">Environment Configuration</h2>

      {/* API Key */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">API Key</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={showApiKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={settings?.apiKey || "Enter API key..."}
              className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Current: {settings?.apiKey || "Not set"}
        </p>
      </div>

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
        <label className="text-xs font-medium text-muted-foreground">Data Path</label>
        <input
          type="text"
          value={dataPath}
          onChange={(e) => setDataPath(e.target.value)}
          placeholder="./data"
          className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          <Save size={14} />
          {isSaving ? "Saving..." : "Save"}
        </button>
        <button
          onClick={handleTest}
          disabled={testing}
          className="flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50 transition-colors"
        >
          <TestTube size={14} />
          {testing ? "Testing..." : "Test Connection"}
        </button>
      </div>

      {/* Test result */}
      {testResult && (
        <div
          className={`rounded-md px-3 py-2 text-xs ${
            testResult.reachable
              ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400"
              : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400"
          }`}
        >
          {testResult.reachable
            ? `Connection successful (${testResult.latency}ms)`
            : "Connection failed"}
        </div>
      )}
    </div>
  );
}
