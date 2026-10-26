"use client";

/**
 * DataManagement — Export and Clear data with real API connections
 *
 * Clear All Data 支持：
 * - Preview 按钮（dry-run，GET /api/data/preview 预览将删的范围）
 * - Confirm 对话框 3 个 scope checkbox（DB / Output / Cache）
 */

import { useState } from "react";
import { renderRich } from "@/lib/i18n/rich";
import {
  Database,
  Download,
  Trash2,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Eye,
} from "lucide-react";
// 导出文件名按产品时区（Asia/Singapore）取日期，而非 UTC
import { localDateStamp } from "@/lib/format-date";
import { useI18n, type MessageKey } from "@/lib/i18n";

// Preview 接口返回的最小结构（只取 UI 需要的 3 个聚合数字）
interface PreviewData {
  dbTotalRows: number;
  outputFiles: number;
  cacheFiles: number;
}

type ScopeKey = "db" | "output" | "cache";

const scopeLabelKeys: Record<ScopeKey, MessageKey> = {
  db: "settings.data.scope.db",
  output: "settings.data.scope.output",
  cache: "settings.data.scope.cache",
};

export function DataManagement() {
  const { t, locale } = useI18n();
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"success" | "error" | "info">(
    "info"
  );
  const [isExporting, setIsExporting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // Preview 状态
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);

  // Scope 选择（默认全选 = 向后兼容全清）
  const [scopes, setScopes] = useState({
    db: true,
    output: true,
    cache: true,
  });

  // 至少勾一个才能提交
  const anyScopeChecked = scopes.db || scopes.output || scopes.cache;

  const handleExport = async () => {
    setIsExporting(true);
    setMessage(t("settings.data.export.preparing"));
    setMessageType("info");
    try {
      const res = await fetch("/api/data/export");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message || t("settings.data.export.failed"));
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `x-bookmark-reports-export-${localDateStamp()}.tar.gz`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setMessage(t("settings.data.export.success"));
      setMessageType("success");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t("settings.data.export.failed"));
      setMessageType("error");
    } finally {
      setIsExporting(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  // Preview handler —— dry-run，仅查询不删除
  const handlePreview = async () => {
    setIsPreviewing(true);
    try {
      const res = await fetch("/api/data/preview");
      const data = await res.json();
      if (data.success) {
        setPreview({
          dbTotalRows: data.data.dbTotalRows,
          outputFiles: data.data.outputFiles,
          cacheFiles: data.data.cacheFiles,
        });
      }
    } catch {
      /* ignore preview errors */
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleDelete = async () => {
    if (confirmText !== "DELETE") return;
    if (!anyScopeChecked) return;

    setIsClearing(true);
    setMessage(t("settings.data.clear.clearing"));
    setMessageType("info");
    try {
      // 按勾选状态构造 scope 数组
      const scopesApplied: ScopeKey[] = [
        ...(scopes.db ? (["db"] as const) : []),
        ...(scopes.output ? (["output"] as const) : []),
        ...(scopes.cache ? (["cache"] as const) : []),
      ];

      const res = await fetch("/api/data/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirm: "DELETE",
          scope: scopesApplied,
        }),
      });
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error?.message || t("settings.data.clear.failed"));
      }

      const { tablesCleared, filesDeleted } = data.data;
      setMessage(
        t("settings.data.clear.success", {
          tables: tablesCleared.length,
          files: filesDeleted,
          scopes: scopesApplied.map((s) => t(scopeLabelKeys[s])).join(locale === "zh" ? "、" : ", "),
        })
      );
      setMessageType("success");
      setShowConfirm(false);
      setConfirmText("");
      setPreview(null);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t("settings.data.clear.failed"));
      setMessageType("error");
    } finally {
      setIsClearing(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const messageColors: Record<string, string> = {
    success: "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400",
    error: "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400",
    info: "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400",
  };

  // 渲染单个 scope checkbox
  const renderScopeCheckbox = (
    key: ScopeKey,
    label: string,
    badge: string | number
  ) => (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={scopes[key]}
        onChange={(e) =>
          setScopes((prev) => ({ ...prev, [key]: e.target.checked }))
        }
        className="h-3.5 w-3.5 rounded border-red-300 text-red-600 focus:ring-red-500"
      />
      <span className="text-xs text-red-700 dark:text-red-300">
        {label}{" "}
        <span className="font-mono text-[10px] text-red-500/80">({badge})</span>
      </span>
    </label>
  );

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Database size={16} className="text-twitter-blue" />
          <h3 className="text-sm font-semibold text-foreground">{t("settings.data.title")}</h3>
        </div>

        {/* Export */}
        <div className="flex items-center justify-between rounded-md bg-muted p-3">
          <div>
            <p className="text-sm font-medium text-foreground">{t("settings.data.export.title")}</p>
            <p className="text-[11px] text-muted-foreground">{t("settings.data.export.desc")}</p>
          </div>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50 transition-colors"
          >
            {isExporting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Download size={14} />
            )}
            {t("settings.data.export.button")}
          </button>
        </div>

        {/* Delete */}
        <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 p-3">
          <div>
            <p className="text-sm font-medium text-red-700 dark:text-red-400">{t("settings.data.clear.title")}</p>
            <p className="text-[11px] text-red-600/70 dark:text-red-400/70">{t("settings.data.clear.desc")}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Preview 按钮 —— 灰底次级 */}
            <button
              onClick={handlePreview}
              disabled={isPreviewing}
              className="flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50 transition-colors"
            >
              {isPreviewing ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Eye size={14} />
              )}
              {t("settings.data.preview")}
            </button>
            <button
              onClick={() => setShowConfirm(true)}
              className="flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 transition-colors"
            >
              <Trash2 size={14} />
              {t("settings.data.clear.button")}
            </button>
          </div>
        </div>

        {/* Preview 结果展示（独立于 Confirm 对话框，便于无确认也能查看） */}
        {preview && (
          <div className="rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-900 p-3 space-y-1">
            <p className="text-xs font-medium text-blue-700 dark:text-blue-300">
              {t("settings.data.preview.title")}
            </p>
            <div className="flex flex-wrap gap-4 text-[11px] text-blue-700 dark:text-blue-300">
              <span>
                <span className="font-mono font-semibold">{preview.dbTotalRows}</span> {t("settings.data.unit.dbRows")}
              </span>
              <span>
                <span className="font-mono font-semibold">{preview.outputFiles}</span>{" "}
                {t("settings.data.unit.outputFiles")}
              </span>
              <span>
                <span className="font-mono font-semibold">{preview.cacheFiles}</span>{" "}
                {t("settings.data.unit.cacheFiles")}
              </span>
            </div>
          </div>
        )}

        {/* Confirmation dialog */}
        {showConfirm && (
          <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 p-3 space-y-3">
            <div className="flex items-center gap-1.5 text-red-700 dark:text-red-400">
              <AlertTriangle size={14} />
              <p className="text-xs font-medium">{t("settings.data.confirm.warning")}</p>
            </div>

            {/* Preview 数据快照（如果已有，直接显示；否则提示点 Preview） */}
            <div className="text-[11px] text-red-600 dark:text-red-300">
              {preview ? (
                <span>
                  {t("settings.data.confirm.willDelete")}{" "}
                  <span className="font-mono font-semibold">{preview.dbTotalRows}</span>{" "}
                  {t("settings.data.unit.dbRows")} +{" "}
                  <span className="font-mono font-semibold">{preview.outputFiles}</span>{" "}
                  {t("settings.data.unit.outputFiles")} +{" "}
                  <span className="font-mono font-semibold">{preview.cacheFiles}</span>{" "}
                  {t("settings.data.unit.cacheFiles")} {t("settings.data.confirm.basedOnPreview")}
                </span>
              ) : (
                <span>
                  {renderRich(t("settings.data.confirm.clickPreview"), {
                    preview: <strong>{t("settings.data.preview")}</strong>,
                  })}
                </span>
              )}
            </div>

            {/* Scope checkboxes */}
            <div className="space-y-1.5 rounded-md bg-red-100/50 dark:bg-red-950/40 p-2">
              <p className="text-[11px] font-medium text-red-700 dark:text-red-300">
                {t("settings.data.scope.title")}
              </p>
              <div className="flex flex-wrap gap-4">
                {renderScopeCheckbox(
                  "db",
                  t(scopeLabelKeys.db),
                  preview ? preview.dbTotalRows : t("settings.data.scope.all")
                )}
                {renderScopeCheckbox(
                  "output",
                  t(scopeLabelKeys.output),
                  preview ? preview.outputFiles : t("settings.data.scope.all")
                )}
                {renderScopeCheckbox(
                  "cache",
                  t(scopeLabelKeys.cache),
                  preview ? preview.cacheFiles : t("settings.data.scope.all")
                )}
              </div>
              {!anyScopeChecked && (
                <p className="text-[10px] text-red-600 dark:text-red-400 mt-1">
                  {t("settings.data.scope.required")}
                </p>
              )}
            </div>

            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              className="w-full rounded-md border border-red-200 dark:border-red-900 bg-muted px-3 py-1.5 text-sm outline-none"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleDelete}
                disabled={confirmText !== "DELETE" || isClearing || !anyScopeChecked}
                className="rounded-md bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {isClearing ? t("settings.data.clear.clearingShort") : t("settings.data.clear.confirmDelete")}
              </button>
              <button
                onClick={() => {
                  setShowConfirm(false);
                  setConfirmText("");
                }}
                className="rounded-md border border-border px-3 py-1 text-xs hover:bg-muted transition-colors"
              >
                {t("common.action.cancel")}
              </button>
            </div>
          </div>
        )}

        {/* Message */}
        {message && (
          <div
            className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-xs ${messageColors[messageType]}`}
          >
            {messageType === "success" ? (
              <CheckCircle size={14} />
            ) : messageType === "error" ? (
              <AlertTriangle size={14} />
            ) : (
              <Loader2 size={14} className="animate-spin" />
            )}
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
