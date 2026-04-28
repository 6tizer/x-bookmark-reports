"use client";

/**
 * DataManagement — Database/export management
 */

import { useState } from "react";
import { Database, Download, Trash2, AlertTriangle, CheckCircle } from "lucide-react";

export function DataManagement() {
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const handleExport = () => {
    setMessage("Export started... (mock)");
    setTimeout(() => setMessage(null), 3000);
  };

  const handleDelete = () => {
    if (confirmText === "DELETE") {
      setMessage("All data cleared. (mock)");
      setShowConfirm(false);
      setConfirmText("");
      setTimeout(() => setMessage(null), 3000);
    }
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
            <p className="text-sm font-medium text-foreground">Export Database</p>
            <p className="text-[11px] text-muted-foreground">Download a backup of all bookmarks, reports, and settings</p>
          </div>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted transition-colors"
          >
            <Download size={14} />
            Export
          </button>
        </div>

        {/* Delete */}
        <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 p-3">
          <div>
            <p className="text-sm font-medium text-red-700 dark:text-red-400">Clear All Data</p>
            <p className="text-[11px] text-red-600/70 dark:text-red-400/70">
              Permanently delete all bookmarks, reports, articles, and settings
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
              className="w-full rounded-md border border-red-200 dark:border-red-900 bg-white dark:bg-background px-3 py-1.5 text-sm outline-none"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleDelete}
                disabled={confirmText !== "DELETE"}
                className="rounded-md bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                Confirm Delete
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
          <div className="flex items-center gap-1.5 rounded-md bg-green-50 dark:bg-green-950/30 px-3 py-2 text-xs text-green-700 dark:text-green-400">
            <CheckCircle size={14} />
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
