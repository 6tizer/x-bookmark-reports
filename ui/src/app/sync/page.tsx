"use client";

/**
 * Sync page — Sync control center
 */

import { ClientLayout } from "@/components/layout/ClientLayout";
import { SyncProgress } from "@/components/sync/SyncProgress";
import { SyncTerminal } from "@/components/sync/SyncTerminal";
import { SyncHistory } from "@/components/sync/SyncHistory";
import { EnvConfig } from "@/components/sync/EnvConfig";
import { useSync } from "@/hooks/useSync";
import { useSettings } from "@/hooks/useSettings";
import { RefreshCw, Zap } from "lucide-react";

export default function SyncPage() {
  const { syncJobs, currentJob, isSyncing, triggerSync, fetchHistory } = useSync();
  const { settings, isSaving, update, test } = useSettings();

  return (
    <ClientLayout>
      <div className="space-y-6 max-w-5xl">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-foreground">Sync Control Center</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => triggerSync("incremental")}
              disabled={isSyncing}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
              {isSyncing ? "Syncing..." : "Incremental Sync"}
            </button>
            <button
              onClick={() => triggerSync("full")}
              disabled={isSyncing}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50 transition-colors"
            >
              <Zap size={14} />
              Full Sync
            </button>
          </div>
        </div>

        {/* Current job */}
        {currentJob && (
          <SyncProgress
            status={currentJob.status}
            progress={currentJob.progress}
            stage={currentJob.stage}
          />
        )}

        {/* Terminal */}
        <SyncTerminal logs={currentJob?.logs || []} />

        {/* History */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">Sync History</h2>
            <button
              onClick={fetchHistory}
              className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted transition-colors"
            >
              <RefreshCw size={11} /> Refresh
            </button>
          </div>
          <SyncHistory jobs={syncJobs} isLoading={false} />
        </div>

        {/* Config */}
        <EnvConfig
          settings={settings}
          isSaving={isSaving}
          onSave={update}
          onTest={test}
        />
      </div>
    </ClientLayout>
  );
}
