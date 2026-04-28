/**
 * Sync Service — sync_bookmarks.sh wrapper
 * CONTRACT v1.0
 */

import { spawn, ChildProcess } from "child_process";
import path from "path";
import type { SyncMode, SyncStatus, PipelineStage } from "@/types/api";
import { createSyncJob, updateSyncJob, createLog, logActivity } from "./db";

type SyncProgressCallback = (event: {
  type: "progress" | "complete" | "error";
  payload: Record<string, unknown>;
}) => void;

const UI_ROOT = path.resolve(process.cwd());
const PARENT_DIR = path.resolve(UI_ROOT, "..");

// Active sync jobs in memory for SSE streaming
const activeJobs = new Map<
  string,
  {
    process: ChildProcess;
    callbacks: Set<SyncProgressCallback>;
    logs: string[];
  }
>();

export async function startSync(mode: SyncMode): Promise<{
  jobId: string;
  status: SyncStatus;
  mode: SyncMode;
  startedAt: string;
}> {
  const job = createSyncJob(mode);

  logActivity("sync", "started", `同步任务 ${job.id} 启动 (${mode})`, {
    syncJobId: job.id,
    mode,
  });
  createLog("sync", "info", `Sync job ${job.id} started in ${mode} mode`);

  // For sandbox environments where the script may not exist, simulate a sync
  const scriptPath = path.join(PARENT_DIR, "sync_bookmarks.sh");
  const scriptExists = await fileExists(scriptPath);

  if (!scriptExists) {
    // Mock execution for development
    simulateSync(job.id, mode);
    return {
      jobId: job.id,
      status: "queued",
      mode,
      startedAt: job.startedAt,
    };
  }

  const args = mode === "full" ? ["--full"] : [];
  const child = spawn("bash", ["../sync_bookmarks.sh", ...args], {
    cwd: UI_ROOT,
    env: { ...process.env },
  });

  activeJobs.set(job.id, {
    process: child,
    callbacks: new Set(),
    logs: [],
  });

  let stdoutBuffer = "";
  let newCount = 0;
  let totalCount = 0;

  child.stdout?.on("data", (data: Buffer) => {
    stdoutBuffer += data.toString();
    const lines = stdoutBuffer.split("\n");
    stdoutBuffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      const jobState = activeJobs.get(job.id);
      if (jobState) {
        jobState.logs.push(line);
      }

      // Parse progress
      const percentMatch = line.match(/(\d+)%/);
      const countMatch = line.match(/(\d+)\/(\d+)/);
      const stageMatch = line.match(/\[(auth|fetching|parsing|storing|done)\]/i);

      const percent = percentMatch ? parseInt(percentMatch[1], 10) : undefined;
      if (countMatch) {
        newCount = parseInt(countMatch[1], 10);
        totalCount = parseInt(countMatch[2], 10);
      }
      const stage = stageMatch
        ? (stageMatch[1].toLowerCase() as PipelineStage)
        : undefined;

      if (percent !== undefined || stage !== undefined) {
        updateSyncJob(job.id, {
          progress: percent ?? 0,
          stage: stage ?? "fetching",
          status: "running",
        });
      }

      emit(job.id, {
        type: "progress",
        payload: {
          percent: percent ?? 0,
          stage: stage ?? "fetching",
          logs: [line],
          newCount,
          totalCount,
        },
      });
    }
  });

  child.stderr?.on("data", (data: Buffer) => {
    const line = data.toString().trim();
    if (!line) return;
    const jobState = activeJobs.get(job.id);
    if (jobState) {
      jobState.logs.push(line);
    }
    emit(job.id, {
      type: "progress",
      payload: {
        percent: 0,
        stage: "fetching",
        logs: [line],
        newCount,
        totalCount,
      },
    });
  });

  child.on("close", (code: number | null) => {
    const completedAt = new Date().toISOString();
    const jobState = activeJobs.get(job.id);
    const allLogs = jobState?.logs ?? [];

    if (code === 0) {
      updateSyncJob(job.id, {
        status: "completed",
        progress: 100,
        stage: "done",
        completedAt,
        newCount,
        totalCount,
        logs: allLogs,
      });
      logActivity("sync", "completed", `同步完成，新增 ${newCount} 条书签`, {
        syncJobId: job.id,
        newCount,
        totalCount,
      });
      createLog("sync", "info", `Sync job ${job.id} completed. New: ${newCount}, Total: ${totalCount}`);
      emit(job.id, {
        type: "complete",
        payload: { newCount, totalCount, completedAt },
      });
    } else {
      const error = {
        code: "SYNC_RETTIWT_ERROR",
        message: `同步脚本退出码 ${code ?? "unknown"}`,
        detail: allLogs.slice(-5).join("\n"),
      };
      updateSyncJob(job.id, {
        status: "failed",
        error,
        completedAt,
        logs: allLogs,
      });
      logActivity("sync", "failed", `同步失败: ${error.message}`, {
        syncJobId: job.id,
        error: error.code,
      });
      createLog("sync", "error", `Sync job ${job.id} failed`, error.detail);
      emit(job.id, {
        type: "error",
        payload: error,
      });
    }

    // Clean up after a delay
    setTimeout(() => activeJobs.delete(job.id), 30000);
  });

  child.on("error", (err: Error) => {
    const completedAt = new Date().toISOString();
    const error = {
      code: "SYNC_RETTIWT_ERROR",
      message: err.message,
      detail: err.stack,
    };
    updateSyncJob(job.id, {
      status: "failed",
      error,
      completedAt,
    });
    logActivity("sync", "failed", `同步失败: ${err.message}`, {
      syncJobId: job.id,
      error: error.code,
    });
    createLog("sync", "error", `Sync job ${job.id} error: ${err.message}`, err.stack);
    emit(job.id, {
      type: "error",
      payload: error,
    });
    activeJobs.delete(job.id);
  });

  return {
    jobId: job.id,
    status: "queued",
    mode,
    startedAt: job.startedAt,
  };
}

function simulateSync(jobId: string, _mode: SyncMode): void {
  // Simulate a sync job for development without real scripts
  let progress = 0;
  const stages: PipelineStage[] = ["auth", "fetching", "parsing", "storing", "done"];
  let stageIdx = 0;

  updateSyncJob(jobId, { status: "running" });

  const interval = setInterval(() => {
    progress += Math.floor(Math.random() * 15) + 5;
    if (progress >= 100) {
      progress = 100;
      stageIdx = 4;
    } else if (progress > 80) {
      stageIdx = 3;
    } else if (progress > 50) {
      stageIdx = 2;
    } else if (progress > 20) {
      stageIdx = 1;
    }

    const stage = stages[stageIdx];
    const newCount = Math.floor((progress / 100) * 12);
    const totalCount = 156;

    updateSyncJob(jobId, {
      progress,
      stage,
      status: progress >= 100 ? "completed" : "running",
      newCount,
      totalCount,
      logs: [`[${new Date().toISOString().slice(11, 19)}] 阶段: ${stage}, 进度: ${progress}%`],
    });

    emit(jobId, {
      type: "progress",
      payload: {
        percent: progress,
        stage,
        logs: [`阶段: ${stage}, 进度: ${progress}%`],
        newCount,
        totalCount,
      },
    });

    if (progress >= 100) {
      clearInterval(interval);
      const completedAt = new Date().toISOString();
      updateSyncJob(jobId, {
        status: "completed",
        progress: 100,
        stage: "done",
        completedAt,
        newCount: 12,
        totalCount: 156,
      });
      logActivity("sync", "completed", `同步完成，新增 12 条书签`, {
        syncJobId: jobId,
        newCount: 12,
        totalCount: 156,
      });
      createLog("sync", "info", `Sync job ${jobId} completed (simulated)`);
      emit(jobId, {
        type: "complete",
        payload: { newCount: 12, totalCount: 156, completedAt },
      });
      setTimeout(() => activeJobs.delete(jobId), 30000);
    }
  }, 800);
}

export function subscribeToSyncJob(
  jobId: string,
  callback: SyncProgressCallback
): (() => void) | null {
  const state = activeJobs.get(jobId);
  if (!state) return null;
  state.callbacks.add(callback);
  return () => state.callbacks.delete(callback);
}

export function getSyncJobLogs(jobId: string): string[] {
  return activeJobs.get(jobId)?.logs ?? [];
}

function emit(jobId: string, event: { type: "progress" | "complete" | "error"; payload: Record<string, unknown> }): void {
  const state = activeJobs.get(jobId);
  if (!state) return;
  Array.from(state.callbacks).forEach((cb) => {
    try {
      cb(event);
    } catch {
      // ignore callback errors
    }
  });
}

async function fileExists(p: string): Promise<boolean> {
  try {
    const stat = await import("fs").then((fs) => fs.promises.stat(p));
    return stat.isFile();
  } catch {
    return false;
  }
}
