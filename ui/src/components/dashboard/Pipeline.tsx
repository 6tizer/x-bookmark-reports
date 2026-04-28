"use client";

/**
 * Pipeline — 4-node pipeline visualization: Sync → Read → Report → Article
 * Node: circular icon + status color (green/yellow/red)
 * Connection lines: solid (done), dashed (pending), animated flowing (in-progress)
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, BookOpen, FileText, Newspaper, X } from "lucide-react";
import type { DashboardPipeline, PipelineStatus } from "@/types/api";
import { Skeleton } from "@/components/ui/Skeleton";

interface PipelineProps {
  pipeline: DashboardPipeline | null;
  isLoading: boolean;
}

interface PipelineNodeDef {
  key: keyof DashboardPipeline;
  label: string;
  icon: React.ReactNode;
}

const nodes: PipelineNodeDef[] = [
  { key: "sync", label: "Sync", icon: <RefreshCw size={16} /> },
  { key: "read", label: "Read", icon: <BookOpen size={16} /> },
  { key: "report", label: "Report", icon: <FileText size={16} /> },
  { key: "article", label: "Article", icon: <Newspaper size={16} /> },
];

function statusColor(status: PipelineStatus): string {
  switch (status) {
    case "completed":
      return "bg-green-500 text-white border-green-500";
    case "running":
      return "bg-twitter-blue text-white border-twitter-blue animate-pulse";
    case "failed":
      return "bg-red-500 text-white border-red-500";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function lineStyle(status: PipelineStatus): string {
  switch (status) {
    case "completed":
      return "bg-green-400";
    case "running":
      return "bg-twitter-blue pipeline-line-active";
    default:
      return "border-t-2 border-dashed border-border bg-transparent";
  }
}

export function Pipeline({ pipeline, isLoading }: PipelineProps) {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  if (isLoading || !pipeline) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <Skeleton className="h-5 w-32 mb-4" />
        <div className="flex items-center gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 flex-1">
              <Skeleton className="h-10 w-10 rounded-full" />
              {i < 3 && <Skeleton className="h-1 flex-1" />}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2 className="text-sm font-semibold text-foreground mb-4">Pipeline</h2>

      <div className="flex items-center">
        {nodes.map((node, i) => {
          const data = pipeline[node.key];
          const isLast = i === nodes.length - 1;
          return (
            <div key={node.key} className="flex items-center flex-1">
              {/* Node */}
              <button
                onClick={() => setSelectedNode(selectedNode === node.key ? null : node.key)}
                className="flex flex-col items-center gap-1.5 group"
              >
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all ${statusColor(
                    data.status
                  )}`}
                >
                  {node.icon}
                </div>
                <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                  {node.label}
                </span>
              </button>

              {/* Connector line */}
              {!isLast && (
                <div className="flex-1 mx-2 h-0.5 relative">
                  <div
                    className={`absolute inset-0 rounded-full ${lineStyle(data.status)}`}
                  />
                  {data.status === "running" && (
                    <motion.div
                      className="absolute top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-white shadow"
                      animate={{ left: ["0%", "100%"] }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Detail drawer */}
      <AnimatePresence>
        {selectedNode && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 rounded-md border border-border bg-muted p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium capitalize">{selectedNode} Details</p>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                <p>
                  Status: <span className="font-medium text-foreground capitalize">{pipeline[selectedNode as keyof DashboardPipeline].status}</span>
                </p>
                {pipeline[selectedNode as keyof DashboardPipeline].lastRun && (
                  <p>
                    Last run: {new Date(pipeline[selectedNode as keyof DashboardPipeline].lastRun!).toLocaleString()}
                  </p>
                )}
                {pipeline[selectedNode as keyof DashboardPipeline].progress !== undefined && (
                  <p>
                    Progress: {pipeline[selectedNode as keyof DashboardPipeline].progress}%
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
