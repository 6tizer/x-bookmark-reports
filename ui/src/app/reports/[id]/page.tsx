"use client";

/**
 * Report detail page — Report preview/editor
 */

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { ClientLayout } from "@/components/layout/ClientLayout";
import { ReportPreview } from "@/components/reports/ReportPreview";
import { useReports } from "@/hooks/useReports";
import { exportReport } from "@/lib/api";
import { Skeleton } from "@/components/ui/Skeleton";

export default function ReportDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const {
    selectedReport,
    isLoading,
    isEditing,
    editContent,
    versions,
    setEditContent,
    selectReport,
    saveSelectedReport,
    fetchVersions,
  } = useReports();

  useEffect(() => {
    if (id) {
      selectReport(id);
      fetchVersions(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleExport = async (format: "md" | "pdf") => {
    const blob = await exportReport(id, format);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedReport?.title || "report"}.${format === "md" ? "md" : "pdf"}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading || !selectedReport) {
    return (
      <ClientLayout>
        <div className="max-w-6xl space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-[60vh] w-full" />
        </div>
      </ClientLayout>
    );
  }

  return (
    <ClientLayout>
      <div className="h-[calc(100vh-6rem)] max-w-6xl">
        <ReportPreview
          report={selectedReport}
          versions={versions}
          isLoading={isLoading}
          isEditing={isEditing}
          editContent={editContent}
          onEditContentChange={setEditContent}
          onToggleEdit={() => {}}
          onSave={saveSelectedReport}
          onExport={handleExport}
          onShowVersions={() => {}}
        />
      </div>
    </ClientLayout>
  );
}
