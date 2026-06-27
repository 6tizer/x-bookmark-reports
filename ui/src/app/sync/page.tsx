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
    isRunning,
    triggerSyncBookmarks,
    triggerArticlePipeline,
    triggerNotionUpload,
    clearCurrentOperation,
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
          component={currentOperation?.component}
          startedAt={currentOperation?.startedAt}
          title={currentOperation?.type}
          onStop={clearCurrentOperation}
        />

        <PipelineHistory />
      </div>
    </ClientLayout>
  );
}
