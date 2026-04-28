"use client";

/**
 * Settings page — Tabbed panel: General, Schedule, Logs, Data
 */

import { useState } from "react";
import { ClientLayout } from "@/components/layout/ClientLayout";
import { GeneralSettings } from "@/components/settings/GeneralSettings";
import { ScheduleSettings } from "@/components/settings/ScheduleSettings";
import { LogViewer } from "@/components/settings/LogViewer";
import { DataManagement } from "@/components/settings/DataManagement";
import { useSettings } from "@/hooks/useSettings";
import { useLogs } from "@/hooks/useLogs";
import { Settings as SettingsIcon, Calendar, FileText, Database } from "lucide-react";

type TabKey = "general" | "schedule" | "logs" | "data";

const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "general", label: "General", icon: <SettingsIcon size={14} /> },
  { key: "schedule", label: "Schedule", icon: <Calendar size={14} /> },
  { key: "logs", label: "Logs", icon: <FileText size={14} /> },
  { key: "data", label: "Data", icon: <Database size={14} /> },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("general");
  const { settings, isLoading, isSaving, update } = useSettings();
  const {
    logs,
    isLoading: logsLoading,
    component,
    level,
    setComponent,
    setLevel,
    refresh,
  } = useLogs();

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
              component={component}
              level={level}
              onComponentChange={setComponent}
              onLevelChange={setLevel}
              onRefresh={refresh}
            />
          )}
          {activeTab === "data" && <DataManagement />}
        </div>
      </div>
    </ClientLayout>
  );
}
