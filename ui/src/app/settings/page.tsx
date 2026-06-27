"use client";

/**
 * Settings page — Tabbed panel: General, LLM & Web Search, Schedule, Logs, Data
 */

import { useState } from "react";
import { ClientLayout } from "@/components/layout/ClientLayout";
import { GeneralSettings } from "@/components/settings/GeneralSettings";
import { LLMSettings } from "@/components/settings/LLMSettings";
import { ScheduleSettings } from "@/components/settings/ScheduleSettings";
import { LogViewer } from "@/components/settings/LogViewer";
import { DataManagement } from "@/components/settings/DataManagement";
import { useSettings } from "@/hooks/useSettings";
import { useLogs } from "@/hooks/useLogs";
import { Settings as SettingsIcon, Cpu, Calendar, FileText, Database } from "lucide-react";
import type { ApiKeyName } from "@/types/api";

type TabKey = "general" | "llm" | "schedule" | "logs" | "data";

const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "general", label: "General", icon: <SettingsIcon size={14} /> },
  { key: "llm", label: "LLM & Web Search", icon: <Cpu size={14} /> },
  { key: "schedule", label: "Schedule", icon: <Calendar size={14} /> },
  { key: "logs", label: "Logs", icon: <FileText size={14} /> },
  { key: "data", label: "Data", icon: <Database size={14} /> },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("general");
  const { settings, isLoading, isSaving, update, updateKey } = useSettings();
  const {
    logs,
    isLoading: logsLoading,
    total: logsTotal,
    page: logsPage,
    hasMore: logsHasMore,
    component,
    level,
    setComponent,
    setLevel,
    setPage: setLogsPage,
    refresh,
  } = useLogs();

  const handleUpdateApiKey = async (request: { keyName: ApiKeyName; apiKey: string }) => {
    await updateKey(request);
  };

  return (
    <ClientLayout>
      <div className="space-y-6 max-w-4xl">
        <h1 className="text-xl font-bold text-foreground">Settings</h1>

        {/* Tabs */}
        <div className="flex items-center gap-0 border-b border-border">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-twitter-blue text-twitter-blue font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="min-h-[400px]">
          {activeTab === "general" && (
            <GeneralSettings
              settings={settings}
              isLoading={isLoading}
              isSaving={isSaving}
              onSave={update}
              onUpdateApiKey={handleUpdateApiKey}
            />
          )}
          {activeTab === "llm" && (
            <LLMSettings
              settings={settings}
              isLoading={isLoading}
              isSaving={isSaving}
              onSave={update}
              onUpdateApiKey={handleUpdateApiKey}
            />
          )}
          {activeTab === "schedule" && (
            <ScheduleSettings
              settings={settings}
              isSaving={isSaving}
              onSave={update}
            />
          )}
          {activeTab === "logs" && (
            <LogViewer
              logs={logs}
              isLoading={logsLoading}
              total={logsTotal}
              page={logsPage}
              hasMore={logsHasMore}
              component={component}
              level={level}
              onComponentChange={setComponent}
              onLevelChange={setLevel}
              onPageChange={setLogsPage}
              onRefresh={refresh}
            />
          )}
          {activeTab === "data" && <DataManagement />}
        </div>
      </div>
    </ClientLayout>
  );
}
