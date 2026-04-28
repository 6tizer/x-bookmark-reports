/**
 * Reader Service — Python reader wrappers
 * CONTRACT v1.0
 */

import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import {
  createReport,
  updateBookmarkStatus,
  updateBookmarkReportPaths,
  createLog,
  logActivity,
  getBookmarkById,
  type ReportType,
  type UrlCategory,
} from "./db";

const UI_ROOT = path.resolve(process.cwd());
const PARENT_DIR = path.resolve(UI_ROOT, "..");
const REPORTS_DIR = path.join(PARENT_DIR, "reports");

async function ensureReportsDir(): Promise<void> {
  const basicDir = path.join(REPORTS_DIR, "basic");
  const enhancedDir = path.join(REPORTS_DIR, "enhanced");
  if (!fs.existsSync(basicDir)) {
    fs.mkdirSync(basicDir, { recursive: true });
  }
  if (!fs.existsSync(enhancedDir)) {
    fs.mkdirSync(enhancedDir, { recursive: true });
  }
}

export async function readBookmark(
  bookmarkId: string,
  url: string,
  type: ReportType = "basic"
): Promise<{
  jobId: string;
  status: "queued" | "running" | "completed" | "failed";
  bookmarkId: string;
}> {
  await ensureReportsDir();
  const jobId = `read_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const bookmark = getBookmarkById(bookmarkId);
  if (!bookmark) {
    throw new Error("BOOKMARK_NOT_FOUND");
  }

  const scriptName =
    type === "basic"
      ? "x-reader/scripts/x_reader.py"
      : "x-tweet-reader/main.py";
  const scriptPath = path.join(PARENT_DIR, scriptName);
  const scriptExists = fs.existsSync(scriptPath);

  if (!scriptExists) {
    // Simulate reader for development
    simulateRead(bookmarkId, url, type, jobId);
    return { jobId, status: "queued", bookmarkId };
  }

  const child = spawn("python3", [scriptName, url], {
    cwd: UI_ROOT,
    env: { ...process.env },
  });

  let stdout = "";
  let stderr = "";

  child.stdout?.on("data", (data: Buffer) => {
    stdout += data.toString();
  });

  child.stderr?.on("data", (data: Buffer) => {
    stderr += data.toString();
  });

  child.on("close", (code: number | null) => {
    if (code === 0) {
      saveReportOutput(bookmarkId, url, type, stdout, jobId);
    } else {
      createLog(
        type === "basic" ? "x-reader" : "x-tweet-reader",
        "error",
        `${type} reader failed for ${bookmarkId}`,
        stderr
      );
    }
  });

  child.on("error", (err: Error) => {
    createLog(
      type === "basic" ? "x-reader" : "x-tweet-reader",
      "error",
      `${type} reader error for ${bookmarkId}: ${err.message}`,
      err.stack
    );
  });

  return { jobId, status: "queued", bookmarkId };
}

export async function batchRead(
  ids: string[],
  type: ReportType
): Promise<{
  jobId: string;
  status: "queued" | "running" | "completed" | "failed";
  total: number;
  completed: number;
  failed: number;
}> {
  const jobId = `batch_read_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  let completed = 0;
  let failed = 0;

  for (const id of ids) {
    const bookmark = getBookmarkById(id);
    if (!bookmark) {
      failed++;
      continue;
    }
    try {
      await readBookmark(id, bookmark.url, type);
      completed++;
    } catch {
      failed++;
    }
  }

  const status = failed === 0 ? "completed" : completed > 0 ? "completed" : "failed";

  logActivity("read", "completed", `批量读取完成 ${completed}/${ids.length}`, {
    jobId,
    total: ids.length,
    completed,
    failed,
  });

  return {
    jobId,
    status,
    total: ids.length,
    completed,
    failed,
  };
}

function simulateRead(
  bookmarkId: string,
  url: string,
  type: ReportType,
  jobId: string
): void {
  const bookmark = getBookmarkById(bookmarkId);
  if (!bookmark) return;

  setTimeout(() => {
    const isEnhanced = type === "enhanced";
    const content = isEnhanced
      ? `# 推文深度分析报告（增强版）\n\n## 原文信息\n- **作者**: ${bookmark.author.name}\n- **原文链接**: ${url}\n\n## 内容深度分析\n...增强版分析内容...\n\n*报告生成时间*: ${new Date().toISOString()}\n*分析引擎*: x-tweet-reader v2.1`
      : `# 推文分析报告\n\n## 原文信息\n- **作者**: ${bookmark.author.name}\n- **原文链接**: ${url}\n\n## 内容摘要\n...基础版分析内容...\n\n*报告生成时间*: ${new Date().toISOString()}`;

    const wordCount = content.trim().split(/\s+/).length;
    const title = `${bookmark.author.name}: 推文分析报告${isEnhanced ? "（增强版）" : ""}`;

    createReport(
      bookmarkId,
      type,
      title,
      content,
      wordCount,
      [],
      `./reports/${type}/${bookmarkId}.md`
    );

    if (type === "basic") {
      updateBookmarkReportPaths(bookmarkId, `./reports/basic/${bookmarkId}.md`, undefined);
    } else {
      updateBookmarkReportPaths(bookmarkId, undefined, `./reports/enhanced/${bookmarkId}.md`);
    }

    updateBookmarkStatus(bookmarkId, "read");

    logActivity("read", "completed", `完成 ${isEnhanced ? "增强版" : "基础版"}读取 ${bookmarkId}`, {
      bookmarkId,
      type,
    });

    createLog(
      isEnhanced ? "x-tweet-reader" : "x-reader",
      "info",
      `${type} reader simulated for ${bookmarkId}, ${wordCount} words`
    );
  }, 2000);
}

function saveReportOutput(
  bookmarkId: string,
  url: string,
  type: ReportType,
  markdown: string,
  _jobId: string
): void {
  const bookmark = getBookmarkById(bookmarkId);
  if (!bookmark) return;

  const fileName = `${bookmarkId}.md`;
  const subDir = type === "basic" ? "basic" : "enhanced";
  const filePath = path.join(REPORTS_DIR, subDir, fileName);

  fs.writeFileSync(filePath, markdown, "utf-8");

  const wordCount = markdown.trim().split(/\s+/).length;
  const title = `${bookmark.author.name}: 推文分析报告${type === "enhanced" ? "（增强版）" : ""}`;

  // Extract URL summaries from markdown (simple heuristic)
  const urlSummary: Array<{ url: string; title: string; category: UrlCategory }> = [];
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(markdown)) !== null) {
    urlSummary.push({
      url: match[2],
      title: match[1],
      category: "article",
    });
  }

  createReport(bookmarkId, type, title, markdown, wordCount, urlSummary, filePath);

  if (type === "basic") {
    updateBookmarkReportPaths(bookmarkId, filePath, undefined);
  } else {
    updateBookmarkReportPaths(bookmarkId, undefined, filePath);
  }

  updateBookmarkStatus(bookmarkId, "read");

  logActivity("read", "completed", `完成 ${type === "enhanced" ? "增强版" : "基础版"}读取 ${bookmarkId}`, {
    bookmarkId,
    type,
  });

  createLog(
    type === "basic" ? "x-reader" : "x-tweet-reader",
    "info",
    `${type} reader completed for ${bookmarkId}, ${wordCount} words`
  );
}
