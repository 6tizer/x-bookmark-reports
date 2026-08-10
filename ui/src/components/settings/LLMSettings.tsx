"use client";

/**
 * LLMSettings — DeepSeek, xAI, Search (SearXNG/Firecrawl), Exa
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

export function LLMSettings({ settings, isLoading, isSaving, onSave, onUpdateApiKey }: LLMSettingsProps) {
  const [deepseekBaseUrl, setDeepseekBaseUrl] = useState("https://api.deepseek.com/v1");
  const [deepseekModel, setDeepseekModel] = useState("deepseek-v4-flash");
  const [xaiBaseUrl, setXaiBaseUrl] = useState("https://api.x.ai/v1");
  const [xaiModel, setXaiModel] = useState("grok-4.3");
  const [exaBaseUrl, setExaBaseUrl] = useState("https://api.exa.ai");
  const [searxngBaseUrl, setSearxngBaseUrl] = useState("");
  const [firecrawlBaseUrl, setFirecrawlBaseUrl] = useState("https://api.firecrawl.dev/v2");

  useEffect(() => {
    if (settings) {
      setDeepseekBaseUrl(settings.deepseekBaseUrl || "https://api.deepseek.com/v1");
      setDeepseekModel(settings.deepseekModel || "deepseek-v4-flash");
      setXaiBaseUrl(settings.xaiBaseUrl || "https://api.x.ai/v1");
      setXaiModel(settings.xaiModel || "grok-4.3");
      setExaBaseUrl(settings.exaBaseUrl || "https://api.exa.ai");
      setSearxngBaseUrl(settings.searxngBaseUrl || "");
      setFirecrawlBaseUrl(settings.firecrawlBaseUrl || "https://api.firecrawl.dev/v2");
    }
  }, [settings]);

  const handleSave = () => {
    onSave({
      deepseekBaseUrl,
      deepseekModel,
      xaiBaseUrl,
      xaiModel,
      exaBaseUrl,
      searxngBaseUrl,
      firecrawlBaseUrl,
    });
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
          {/* DeepSeek 双兼容提示：SDK 会自动拼接 /chat/completions */}
          <p className="text-[10px] text-muted-foreground">
            DeepSeek SDK 双兼容：用 <code>https://api.deepseek.com</code> 或 <code>.../v1</code> 均可；OpenAI SDK 会自动拼接 <code>/chat/completions</code>
          </p>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Model
            <span className="ml-2 text-[10px] text-muted-foreground/70 font-normal">
              持久化 → <code>.env DEEPSEEK_MODEL</code>，rewrite 步骤使用
            </span>
          </label>
          <select
            value={deepseekModel}
            onChange={(e) => setDeepseekModel(e.target.value)}
            className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="deepseek-v4-flash">deepseek-v4-flash</option>
            <option value="deepseek-v4-pro">deepseek-v4-pro</option>
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
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Research Model
            <span className="ml-2 text-[10px] text-muted-foreground/70 font-normal">
              持久化 → <code>.env XAI_MODEL</code>，研究步骤（responses.create + web_search + x_search）使用
            </span>
          </label>
          <input
            type="text"
            value={xaiModel}
            onChange={(e) => setXaiModel(e.target.value)}
            placeholder="grok-4.3"
            className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm font-mono outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      {/* Search (SearXNG 主 / Firecrawl 备) */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Search (SearXNG / Firecrawl)</h3>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            SearXNG Base URL
            <span className="ml-2 text-[10px] text-muted-foreground/70 font-normal">
              主搜索，自托管实例，无需 key
            </span>
          </label>
          <input
            type="text"
            value={searxngBaseUrl}
            onChange={(e) => setSearxngBaseUrl(e.target.value)}
            placeholder="http://<host>:8888（留空则跳过 SearXNG）"
            className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <ApiKeyField
          label="Firecrawl API Key（可留空走 Keyless）"
          maskedValue={settings?.firecrawlApiKey || "****"}
          keyName="FIRECRAWL_API_KEY"
          onSave={handleApiKeySave}
        />
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Firecrawl Base URL
            <span className="ml-2 text-[10px] text-muted-foreground/70 font-normal">
              备用搜索：仅 SearXNG 失败或 0 结果时启用
            </span>
          </label>
          <input
            type="text"
            value={firecrawlBaseUrl}
            onChange={(e) => setFirecrawlBaseUrl(e.target.value)}
            className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      {/* Exa */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Exa (可选补充)</h3>
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
