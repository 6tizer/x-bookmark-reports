"use client";

/**
 * GeneralSettings — API Keys, paths, toggles
 */

import { useState, useEffect } from "react";
import { Save, Eye, EyeOff } from "lucide-react";
import type { Settings, UpdateSettingsRequest, ApiKeyName } from "@/types/api";

interface GeneralSettingsProps {
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

// 统一 toggle 行：左侧 label+desc 自适应，右侧固定宽度 toggle 按钮——
// 多处复用确保不同 section 间 toggle 视觉严格对齐
function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && (
          <p className="text-[11px] text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="shrink-0 w-9">
        <button
          type="button"
          onClick={() => onChange(!checked)}
          className={`relative block h-5 w-9 rounded-full transition-colors ${
            checked ? "bg-twitter-blue" : "bg-muted"
          }`}
          aria-pressed={checked}
        >
          {/* 圆点 14×14，上下左右各预留 3px 边距，OFF→ON 平移 16px */}
          <span
            className={`absolute top-[3px] left-[3px] h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
              checked ? "translate-x-[16px]" : "translate-x-0"
            }`}
          />
        </button>
      </div>
    </div>
  );
}

export function GeneralSettings({ settings, isLoading, isSaving, onSave, onUpdateApiKey }: GeneralSettingsProps) {
  const [proxy, setProxy] = useState("");
  const [dataPath, setDataPath] = useState("");
  const [bookmarksPath, setBookmarksPath] = useState("");
  const [articlesDir, setArticlesDir] = useState("");
  const [notionDbId, setNotionDbId] = useState("");
  const [notionUploadLive, setNotionUploadLive] = useState(false);

  useEffect(() => {
    if (settings) {
      setProxy(settings.proxy || "");
      setDataPath(settings.dataPath || "./data");
      setBookmarksPath(settings.bookmarksPath || "");
      setArticlesDir(settings.articlesDir || "");
      setNotionDbId(settings.notionDbId || "");
      setNotionUploadLive(settings.notionUploadLive);
    }
  }, [settings]);

  const handleSave = async () => {
    // 至少 350ms 显示 "Saving..." 反馈，避免后端 <100ms 一闪而过用户看不到
    await Promise.all([
      onSave({
        proxy: proxy || null,
        dataPath,
        bookmarksPath,
        articlesDir,
        notionDbId,
        notionUploadLive,
      }),
      new Promise((r) => setTimeout(r, 350)),
    ]);
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
      {/* API Keys Section */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">API Keys</h3>

        <ApiKeyField
          label="Twitter API Key"
          maskedValue={settings?.twitterApiKey || "****"}
          keyName="TWITTER_API_IO_KEY"
          onSave={handleApiKeySave}
        />

        <ApiKeyField
          label="Notion Token"
          maskedValue={settings?.notionToken || "****"}
          keyName="NOTION_TOKEN"
          onSave={handleApiKeySave}
        />

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Notion Database ID</label>
          <input
            type="text"
            value={notionDbId}
            onChange={(e) => setNotionDbId(e.target.value)}
            placeholder="notion-database-id"
            className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm font-mono outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* Notion Upload Live */}
        <ToggleRow
          label="Notion Upload Live"
          description="Actually upload to Notion (vs dry-run)"
          checked={notionUploadLive}
          onChange={setNotionUploadLive}
        />
      </div>

      {/* Paths Section */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-foreground">Paths</h3>
          <span className="text-[10px] text-muted-foreground/70">Use absolute path</span>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Bookmarks Path</label>
          <input
            type="text"
            value={bookmarksPath}
            onChange={(e) => setBookmarksPath(e.target.value)}
            placeholder="/Users/<user>/Library/Application Support/.../Bookmarks"
            className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Articles Output Dir</label>
          <input
            type="text"
            value={articlesDir}
            onChange={(e) => setArticlesDir(e.target.value)}
            placeholder="/Users/<user>/work/.../x-bookmark-reports/output/article-final"
            className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Data Directory</label>
          <input
            type="text"
            value={dataPath}
            onChange={(e) => setDataPath(e.target.value)}
            placeholder="/Users/<user>/work/.../x-bookmark-reports/data"
            className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      {/* Network + Sync */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Network</h3>

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
