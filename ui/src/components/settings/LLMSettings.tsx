"use client";

/**
 * LLMSettings — DeepSeek, xAI, Exa, Pipeline Default Model
 */

import { useState, useEffect } from "react";
import { Save, Eye, EyeOff } from "lucide-react";
import type { Settings, UpdateSettingsRequest, ApiKeyName } from "@/types/api";

interface LLMSettingsProps {
  settings: Settings | null;
  isLoading: boolean;
  isSaving: boolean;
  onSave: (request: UpdateSettingsRequest) => Promise<void>;
  onUpdateApiKey: (request: { keyName: ApiKeyName; apiKey: string }) => Promise<void>;
}

function ApiKeyField({
  label,
  maskedValue,
  keyName,
  onSave,
}: {
  label: string;
  maskedValue: string;
  keyName: ApiKeyName;
  onSave: (keyName: ApiKeyName, rawValue: string) => void;
}) {
  const [showKey, setShowKey] = useState(false);
  const [revealedValue, setRevealedValue] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);

  const handleToggleReveal = async () => {
    if (showKey) {
      setShowKey(false);
      setRevealedValue(null);
    } else {
      setIsRevealing(true);
      try {
        const res = await fetch(`/api/settings/api-key?keyName=${keyName}`);
        const data = await res.json();
        if (data.success) {
          setRevealedValue(data.data.value);
          setShowKey(true);
        }
      } catch {
        /* ignore */
      } finally {
        setIsRevealing(false);
      }
    }
  };

  const handleStartEdit = () => {
    setEditValue("");
    setIsEditing(true);
    setShowKey(true);
  };

  const handleSave = () => {
    if (editValue && editValue.length >= 4) {
      const encoded = typeof window !== "undefined" ? btoa(editValue) : Buffer.from(editValue).toString("base64");
      onSave(keyName, encoded);
      setIsEditing(false);
      setEditValue("");
      setRevealedValue(null);
      setShowKey(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditValue("");
  };

  const displayValue = isEditing ? editValue : (showKey && revealedValue ? revealedValue : maskedValue);

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="relative">
        <input
          type="text"
          value={displayValue}
          onChange={(e) => isEditing && setEditValue(e.target.value)}
          onFocus={handleStartEdit}
          readOnly={!isEditing}
          placeholder="Click to set..."
          className="w-full rounded-md border border-border bg-muted px-3 py-2 pr-8 text-sm font-mono outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          type="button"
          onClick={isEditing ? () => setShowKey(!showKey) : handleToggleReveal}
          disabled={isRevealing}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        >
          {isRevealing ? <span className="text-[10px]">...</span> : (showKey ? <EyeOff size={14} /> : <Eye size={14} />)}
        </button>
      </div>
      {isEditing && (
        <div className="flex gap-2 mt-1">
          <button
            onClick={handleSave}
            disabled={!editValue || editValue.length < 4}
            className="rounded-md bg-primary px-2 py-1 text-[11px] text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Save Key
          </button>
          <button
            onClick={handleCancel}
            className="rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

const PIPELINE_MODEL_STORAGE = "articlePipelineModel";

const MODEL_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Default (env)" },
  { value: "deepseek-chat", label: "DeepSeek Chat" },
  { value: "deepseek-reasoner", label: "DeepSeek Reasoner" },
  { value: "grok-2-latest", label: "xAI Grok" },
];

export function LLMSettings({ settings, isLoading, isSaving, onSave, onUpdateApiKey }: LLMSettingsProps) {
  const [deepseekBaseUrl, setDeepseekBaseUrl] = useState("https://api.deepseek.com/v1");
  const [deepseekModel, setDeepseekModel] = useState("deepseek-chat");
  const [xaiBaseUrl, setXaiBaseUrl] = useState("https://api.x.ai/v1");
  const [exaBaseUrl, setExaBaseUrl] = useState("https://api.exa.ai");
  const [pipelineModel, setPipelineModel] = useState("");

  useEffect(() => {
    if (settings) {
      setDeepseekBaseUrl(settings.deepseekBaseUrl || "https://api.deepseek.com/v1");
      setDeepseekModel(settings.deepseekModel || "deepseek-chat");
      setXaiBaseUrl(settings.xaiBaseUrl || "https://api.x.ai/v1");
      setExaBaseUrl(settings.exaBaseUrl || "https://api.exa.ai");
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
      deepseekBaseUrl,
      deepseekModel,
      xaiBaseUrl,
      exaBaseUrl,
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

  const handleApiKeySave = (keyName: ApiKeyName, encoded: string) => {
    onUpdateApiKey({ keyName, apiKey: encoded });
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
      {/* DeepSeek */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">DeepSeek</h3>
        <ApiKeyField
          label="API Key"
          maskedValue={settings?.deepseekApiKey || "****"}
          keyName="DEEPSEEK_API_KEY"
          onSave={handleApiKeySave}
        />
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Base URL</label>
          <input
            type="text"
            value={deepseekBaseUrl}
            onChange={(e) => setDeepseekBaseUrl(e.target.value)}
            className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Model</label>
          <select
            value={deepseekModel}
            onChange={(e) => setDeepseekModel(e.target.value)}
            className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="deepseek-chat">deepseek-chat</option>
            <option value="deepseek-reasoner">deepseek-reasoner</option>
          </select>
        </div>
      </div>

      {/* xAI */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">xAI (Grok)</h3>
        <ApiKeyField
          label="API Key"
          maskedValue={settings?.xaiApiKey || "****"}
          keyName="XAI_API_KEY"
          onSave={handleApiKeySave}
        />
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Base URL</label>
          <input
            type="text"
            value={xaiBaseUrl}
            onChange={(e) => setXaiBaseUrl(e.target.value)}
            className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      {/* Exa */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Exa (Web Search)</h3>
        <ApiKeyField
          label="API Key"
          maskedValue={settings?.exaApiKey || "****"}
          keyName="EXA_API_KEY"
          onSave={handleApiKeySave}
        />
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Base URL</label>
          <input
            type="text"
            value={exaBaseUrl}
            onChange={(e) => setExaBaseUrl(e.target.value)}
            className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      {/* Pipeline Default Model */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Pipeline Default Model</h3>
        <p className="text-[10px] text-muted-foreground">
          Stored in this browser only. Passed to <code className="text-[10px]">bin/article_pipeline.py --model</code> when
          you run the pipeline from the UI.
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
