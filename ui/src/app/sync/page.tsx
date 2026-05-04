"use client";

/**
 * Sync page — Pipeline Control Center
 */

import { ClientLayout } from "@/components/layout/ClientLayout";
import { PipelineOverview } from "@/components/sync/PipelineOverview";
import { PipelineActions } from "@/components/sync/PipelineActions";
import { SyncTerminal } from "@/components/sync/SyncTerminal";
import { PipelineHistory } from "@/components/sync/PipelineHistory";
import { usePipeline } from "@/hooks/usePipeline";

export default function SyncPage() {
  const {
    currentOperation,
    history,
    isRunning,
    triggerSyncBookmarks,
    triggerArticlePipeline,
    triggerNotionUpload,
    clearHistory,
  } = usePipeline();

  return (
    <ClientLayout>
      <div className="space-y-6 max-w-5xl">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-foreground">
            Pipeline Control Center
          </h1>
        </div>

        <PipelineOverview />

        <PipelineActions
          onTriggerSyncBookmarks={triggerSyncBookmarks}
          onTriggerArticlePipeline={triggerArticlePipeline}
          onTriggerNotionUpload={triggerNotionUpload}
          isRunning={isRunning}
          currentType={currentOperation?.type ?? null}
        />

        <SyncTerminal
          logs={
            currentOperation
              ? [
                  `${currentOperation.type} started: ${currentOperation.command.join(" ")}`,
                ]
              : []
          }
          title={currentOperation?.type}
        />

        <PipelineHistory history={history} onClear={clearHistory} />
      </div>
    </ClientLayout>
  );
}
