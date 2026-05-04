"use client";

/**
 * DataManagement — Export and Clear data with real API connections
 */

import { useState } from "react";
import { Database, Download, Trash2, AlertTriangle, CheckCircle, Loader2 } from "lucide-react";

export function DataManagement() {
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"success" | "error" | "info">("info");
  const [isExporting, setIsExporting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    setMessage("Preparing export...");
    setMessageType("info");
    try {
      const res = await fetch("/api/data/export");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message || "Export failed");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `x-bookmark-reports-export-${new Date().toISOString().slice(0, 10)}.tar.gz`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setMessage("Export downloaded successfully!");
      setMessageType("success");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Export failed");
      setMessageType("error");
    } finally {
      setIsExporting(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const handleDelete = async () => {
    if (confirmText !== "DELETE") return;

    setIsClearing(true);
    setMessage("Clearing data...");
    setMessageType("info");
    try {
      const res = await fetch("/api/data/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error?.message || "Clear failed");
      }

      const { tablesCleared, filesDeleted } = data.data;
      setMessage(`Cleared ${tablesCleared.length} tables, ${filesDeleted} files.`);
      setMessageType("success");
      setShowConfirm(false);
      setConfirmText("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Clear failed");
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

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Database size={16} className="text-twitter-blue" />
          <h3 className="text-sm font-semibold text-foreground">Data Management</h3>
        </div>

        {/* Export */}
        <div className="flex items-center justify-between rounded-md bg-muted p-3">
          <div>
            <p className="text-sm font-medium text-foreground">Export Data</p>
            <p className="text-[11px] text-muted-foreground">
              Download output/, cache/, database, and .env (API keys masked) as tar.gz
            </p>
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
            Export
          </button>
        </div>

        {/* Delete */}
        <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 p-3">
          <div>
            <p className="text-sm font-medium text-red-700 dark:text-red-400">Clear All Data</p>
            <p className="text-[11px] text-red-600/70 dark:text-red-400/70">
              Permanently delete DB rows, output files, cache, and logs. Keeps .env and 归档/.
            </p>
          </div>
          <button
            onClick={() => setShowConfirm(true)}
            className="flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 transition-colors"
          >
            <Trash2 size={14} />
            Clear
          </button>
        </div>

        {/* Confirmation dialog */}
        {showConfirm && (
          <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-red-700 dark:text-red-400">
              <AlertTriangle size={14} />
              <p className="text-xs font-medium">This action cannot be undone. Type DELETE to confirm.</p>
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
                disabled={confirmText !== "DELETE" || isClearing}
                className="rounded-md bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {isClearing ? "Clearing..." : "Confirm Delete"}
              </button>
              <button
                onClick={() => { setShowConfirm(false); setConfirmText(""); }}
                className="rounded-md border border-border px-3 py-1 text-xs hover:bg-muted transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Message */}
        {message && (
          <div className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-xs ${messageColors[messageType]}`}>
            {messageType === "success" ? <CheckCircle size={14} /> : messageType === "error" ? <AlertTriangle size={14} /> : <Loader2 size={14} className="animate-spin" />}
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
