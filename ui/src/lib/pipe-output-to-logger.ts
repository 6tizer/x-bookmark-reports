/**
 * pipeOutputToLogger — 子进程 stdout/stderr 写入 DB logs 表（三处 route 共用）
 */

import { createInterface } from "readline";
import type { ChildProcess } from "child_process";
import { createLog } from "@/lib/db";
import { parseStdoutLogLevel, parseStderrLogLevel } from "@/lib/pipeline-log";

type LogComponent = "coordinator" | "article_pipeline" | "notion_upload";

/** 将子进程 stdout/stderr 按行写入 SQLite logs 表 */
export function pipeOutputToLogger(child: ChildProcess, component: LogComponent): void {
  if (child.stdout) {
    const rl = createInterface({ input: child.stdout });
    rl.on("line", (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const level = parseStdoutLogLevel(trimmed);
      try {
        createLog(component, level, trimmed.slice(0, 500), trimmed.length > 500 ? trimmed : undefined);
      } catch {
        /* ignore if DB not ready */
      }
    });
  }
  if (child.stderr) {
    const rl = createInterface({ input: child.stderr });
    rl.on("line", (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        createLog(component, parseStderrLogLevel(), trimmed.slice(0, 500), trimmed.length > 500 ? trimmed : undefined);
      } catch {
        /* ignore */
      }
    });
  }
}
