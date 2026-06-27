/**
 * API Client — Fetch wrapper with mock support
 * x-bookmark-reports UI v1.0
 */

import type {
  ApiResponse,
  PaginatedResponse,
  DashboardStats,
  ActivityItem,
  Bookmark,
  BookmarkDetail,
  BookmarkListQuery,
  BatchReadRequest,
  BatchReadResponse,
  SyncStartRequest,
  SyncStartResponse,
  SyncJob,
  Report,
  ReportListQuery,
  UpdateReportRequest,
  ReportVersion,
  Article,
  ArticleVersion,
  CreateArticleRequest,
  UpdateArticleRequest,
  PublishRequest,
  Settings,
  UpdateSettingsRequest,
  UpdateApiKeyRequest,
  ConnectionTestResult,
  LogEntry,
  LogQuery,
  SSEEvent,
  RettiwtStatus,
  BatchProgress,
  PipelineRunRequest,
  PipelineBatchRequest,
  PipelineRunResult,
} from "@/types/api";

import {
  mockBookmarks,
  mockBookmarkDetail,
  mockSyncJobs,
  mockReports,
  mockArticles,
  mockActivities,
  mockLogs,
  mockSettings,
  mockDashboardStats,
  mockReportVersions,
  mockArticleVersions,
  getBookmarkById,
  getReportById,
  getArticleById,
  getSyncJobById,
  getBookmarkReports,
} from "@/db/mock";

// ─────────────────────────────────────────────
// Mock flag
// ─────────────────────────────────────────────

export const USE_MOCK = false;

const BASE_URL = "/api";

// ─────────────────────────────────────────────
// Error class
// ─────────────────────────────────────────────

export class ApiError extends Error {
  code: string;
  detail?: string;
  status: number;

  constructor(message: string, code: string, status: number, detail?: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

// ─────────────────────────────────────────────
// Fetch wrapper
// ─────────────────────────────────────────────

async function fetcher<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  if (USE_MOCK) {
    throw new Error("fetcher should not be called in mock mode");
  }

  const url = `${BASE_URL}${endpoint}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({} as Record<string, unknown>));
    throw new ApiError(
      (errBody?.message as string) || res.statusText,
      (errBody?.error?.code as string) || "UNKNOWN_ERROR",
      res.status,
      (errBody?.error?.detail as string) || undefined
    );
  }

  const body = (await res.json()) as ApiResponse<T>;
  if (!body.success) {
    throw new ApiError(
      body.error?.message || "Unknown error",
      body.error?.code || "UNKNOWN_ERROR",
      res.status,
      body.error?.detail
    );
  }

  if (body.data === null) {
    throw new ApiError("Empty response data", "EMPTY_DATA", res.status);
  }

  return body.data;
}

// ─────────────────────────────────────────────
// Mock delay helper
// ─────────────────────────────────────────────

function mockDelay(ms = 300): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────
// Paginated mock helper
// ─────────────────────────────────────────────

function paginate<T>(items: T[], page = 1, limit = 20): PaginatedResponse<T> {
  const start = (page - 1) * limit;
  const end = start + limit;
  return {
    items: items.slice(start, end),
    total: items.length,
    page,
    limit,
    hasMore: end < items.length,
  };
}

// ─────────────────────────────────────────────
// API methods
// ─────────────────────────────────────────────

export const api = {
  get: <T>(endpoint: string, params?: Record<string, string | number | undefined>) => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined) searchParams.append(k, String(v));
      });
    }
    const qs = searchParams.toString();
    return fetcher<T>(`${endpoint}${qs ? `?${qs}` : ""}`);
  },

  post: <T>(endpoint: string, body: unknown) =>
    fetcher<T>(endpoint, { method: "POST", body: JSON.stringify(body) }),

  put: <T>(endpoint: string, body: unknown) =>
    fetcher<T>(endpoint, { method: "PUT", body: JSON.stringify(body) }),

  delete: <T>(endpoint: string) => fetcher<T>(endpoint, { method: "DELETE" }),
};

// ─────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────

export async function getDashboardStats(): Promise<DashboardStats> {
  if (USE_MOCK) {
    await mockDelay(200);
    return mockDashboardStats;
  }
  return api.get<DashboardStats>("/dashboard/stats");
}

export async function getDashboardActivity(limit = 20): Promise<{ items: ActivityItem[]; total: number }> {
  if (USE_MOCK) {
    await mockDelay(200);
    return { items: mockActivities.slice(0, limit), total: mockActivities.length };
  }
  return api.get<{ items: ActivityItem[]; total: number }>("/dashboard/activity", { limit });
}

export async function getRettiwtStatus(): Promise<RettiwtStatus> {
  if (USE_MOCK) {
    await mockDelay(100);
    return {
      localVersion: "4.0.0",
      latestVersion: "4.0.0",
      updateAvailable: false,
      checkedAt: new Date().toISOString(),
    };
  }
  return api.get<RettiwtStatus>("/system/rettiwt");
}

// ─────────────────────────────────────────────
// Bookmarks
// ─────────────────────────────────────────────

export async function getBookmarks(query?: BookmarkListQuery): Promise<PaginatedResponse<Bookmark>> {
  if (USE_MOCK) {
    await mockDelay(300);
    let items = [...mockBookmarks];
    if (query?.search) {
      const q = query.search.toLowerCase();
      items = items.filter(
        (b) =>
          b.text.toLowerCase().includes(q) ||
          b.author.name.toLowerCase().includes(q) ||
          b.author.handle.toLowerCase().includes(q)
      );
    }
    if (query?.status) {
      items = items.filter((b) => b.status === query.status);
    }
    if (query?.tag) {
      items = items.filter((b) => b.tags.includes(query.tag as string));
    }
    if (query?.urlCategory) {
      items = items.filter((b) => b.urlCategory === query.urlCategory);
    }
    if (query?.author) {
      items = items.filter(
        (b) =>
          b.author.name.toLowerCase().includes(query.author!.toLowerCase()) ||
          b.author.handle.toLowerCase().includes(query.author!.toLowerCase())
      );
    }
    if (query?.sort) {
      const [field, order] = query.sort.split(":");
      items = items.sort((a, b) => {
        let cmp = 0;
        if (field === "bookmarkedAt") cmp = new Date(a.bookmarkedAt).getTime() - new Date(b.bookmarkedAt).getTime();
        else if (field === "likes") cmp = a.stats.likes - b.stats.likes;
        else if (field === "replies") cmp = a.stats.replies - b.stats.replies;
        else if (field === "bookmarks") cmp = a.stats.bookmarks - b.stats.bookmarks;
        else if (field === "views") cmp = a.stats.views - b.stats.views;
        return order === "desc" ? -cmp : cmp;
      });
    }
    return paginate(items, query?.page ?? 1, query?.limit ?? 20);
  }
  return api.get<PaginatedResponse<Bookmark>>("/bookmarks", query as Record<string, string | number>);
}

export async function getBookmarkByIdAPI(id: string): Promise<BookmarkDetail> {
  if (USE_MOCK) {
    await mockDelay(300);
    const bookmark = getBookmarkById(id);
    if (!bookmark) throw new ApiError("Bookmark not found", "NOT_FOUND", 404);
    const reports = getBookmarkReports(id);
    return {
      ...bookmark,
      fullText: mockBookmarkDetail.fullText,
      replies: mockBookmarkDetail.replies,
      externalLinks: mockBookmarkDetail.externalLinks,
      reports: {
        basic: reports.find((r) => r.type === "basic"),
        enhanced: reports.find((r) => r.type === "enhanced"),
      },
    };
  }
  return api.get<BookmarkDetail>(`/bookmarks/${id}`);
}

export async function startRead(bookmarkId: string, enhanced = false): Promise<{ jobId: string; status: string; bookmarkId: string }> {
  if (USE_MOCK) {
    await mockDelay(500);
    return { jobId: `read_${bookmarkId.slice(-4)}`, status: "queued", bookmarkId };
  }
  const endpoint = enhanced
    ? `/bookmarks/${bookmarkId}/read-enhanced`
    : `/bookmarks/${bookmarkId}/read`;
  return api.post<{ jobId: string; status: string; bookmarkId: string }>(endpoint, {});
}

export async function batchRead(request: BatchReadRequest): Promise<BatchReadResponse> {
  if (USE_MOCK) {
    await mockDelay(500);
    return {
      jobId: `batch_read_${Date.now()}`,
      status: "queued",
      total: request.ids.length,
      completed: 0,
      failed: 0,
    };
  }
  return api.post<BatchReadResponse>("/bookmarks/batch-read", request);
}

export async function updateBookmarkTags(bookmarkId: string, tags: string[]): Promise<void> {
  if (USE_MOCK) {
    await mockDelay(200);
    const b = mockBookmarks.find((bm) => bm.id === bookmarkId);
    if (b) b.tags = tags;
    return;
  }
  await api.put<void>(`/bookmarks/${bookmarkId}/tags`, { tags });
}

export async function updateBookmarkStatus(bookmarkId: string, status: Bookmark["status"]): Promise<void> {
  if (USE_MOCK) {
    await mockDelay(200);
    const b = mockBookmarks.find((bm) => bm.id === bookmarkId);
    if (b) b.status = status;
    return;
  }
  await api.put<void>(`/bookmarks/${bookmarkId}/status`, { status });
}

// ─────────────────────────────────────────────
// Sync
// ─────────────────────────────────────────────

export async function startSync(mode: "incremental" | "full" = "incremental"): Promise<SyncStartResponse> {
  if (USE_MOCK) {
    await mockDelay(400);
    const newJob: SyncJob = {
      id: `sync_${Date.now()}`,
      mode,
      status: "running",
      progress: 0,
      stage: "auth",
      logs: [`[${new Date().toISOString().split("T")[1].slice(0, 8)}] 同步任务启动`],
      startedAt: new Date().toISOString(),
      newCount: 0,
      totalCount: 0,
    };
    mockSyncJobs.unshift(newJob);
    return { jobId: newJob.id, status: "queued", mode, startedAt: newJob.startedAt };
  }
  return api.post<SyncStartResponse>("/sync", { mode } as SyncStartRequest);
}

export async function getSyncJob(jobId: string): Promise<SyncJob> {
  if (USE_MOCK) {
    await mockDelay(200);
    const job = getSyncJobById(jobId);
    if (!job) throw new ApiError("Sync job not found", "NOT_FOUND", 404);
    return job;
  }
  return api.get<SyncJob>(`/sync/${jobId}`);
}

export async function getSyncHistory(): Promise<PaginatedResponse<SyncJob>> {
  if (USE_MOCK) {
    await mockDelay(200);
    return paginate(mockSyncJobs, 1, 20);
  }
  return api.get<PaginatedResponse<SyncJob>>("/sync/history");
}

export function connectSyncSSE(jobId: string, onEvent: (event: SSEEvent) => void): () => void {
  if (USE_MOCK) {
    const interval = setInterval(() => {
      const job = getSyncJobById(jobId);
      if (!job) return;
      if (job.status === "running") {
        onEvent({
          type: "progress",
          payload: {
            percent: Math.min(job.progress + 5, 95),
            stage: job.stage,
            logs: job.logs.slice(-3),
            newCount: job.newCount,
            totalCount: job.totalCount,
          },
        });
      } else if (job.status === "completed") {
        onEvent({
          type: "complete",
          payload: { newCount: job.newCount, totalCount: job.totalCount, completedAt: job.completedAt || new Date().toISOString() },
        });
        clearInterval(interval);
      } else if (job.status === "failed") {
        onEvent({
          type: "error",
          payload: { code: job.error?.code || "UNKNOWN", message: job.error?.message || "Unknown error" },
        });
        clearInterval(interval);
      }
    }, 2000);
    return () => clearInterval(interval);
  }

  const es = new EventSource(`${BASE_URL}/sync/${jobId}/stream`);
  es.addEventListener("progress", (e: MessageEvent) => {
    const data = JSON.parse(String(e.data)) as SSEEvent;
    onEvent(data);
  });
  es.addEventListener("complete", (e: MessageEvent) => {
    const data = JSON.parse(String(e.data)) as SSEEvent;
    onEvent(data);
    es.close();
  });
  es.addEventListener("error", (e: MessageEvent) => {
    if (e.data) {
      try {
        const data = JSON.parse(String(e.data)) as SSEEvent;
        onEvent(data);
      } catch {
        /* non-JSON error event */
      }
    }
    es.close();
  });
  return () => es.close();
}

// ─────────────────────────────────────────────
// Reports
// ─────────────────────────────────────────────

export async function getReports(query?: ReportListQuery): Promise<PaginatedResponse<Report>> {
  if (USE_MOCK) {
    await mockDelay(300);
    let items = [...mockReports];
    if (query?.bookmarkId) items = items.filter((r) => r.bookmarkId === query.bookmarkId);
    if (query?.author) items = items.filter((r) => r.title.toLowerCase().includes(query.author!.toLowerCase()));
    if (query?.type) items = items.filter((r) => r.type === query.type);
    if (query?.search) {
      const q = query.search.toLowerCase();
      items = items.filter((r) => r.title.toLowerCase().includes(q) || r.content.toLowerCase().includes(q));
    }
    return paginate(items, query?.page ?? 1, query?.limit ?? 20);
  }
  return api.get<PaginatedResponse<Report>>("/reports", query as Record<string, string | number>);
}

export async function getReportByIdAPI(id: string): Promise<Report> {
  if (USE_MOCK) {
    await mockDelay(300);
    const report = getReportById(id);
    if (!report) throw new ApiError("Report not found", "NOT_FOUND", 404);
    return report;
  }
  return api.get<Report>(`/reports/${id}`);
}

export async function saveReport(id: string, request: UpdateReportRequest): Promise<{ id: string; version: number; updatedAt: string }> {
  if (USE_MOCK) {
    await mockDelay(400);
    const report = getReportById(id);
    if (report) report.content = request.content;
    return { id, version: 1, updatedAt: new Date().toISOString() };
  }
  return api.put<{ id: string; version: number; updatedAt: string }>(`/reports/${id}`, request);
}

export async function getReportVersions(reportId: string): Promise<ReportVersion[]> {
  if (USE_MOCK) {
    await mockDelay(200);
    return mockReportVersions.filter((v) => v.reportId === reportId);
  }
  return api.get<ReportVersion[]>(`/reports/${reportId}/versions`);
}

export async function exportReport(reportId: string, format: "md" | "pdf"): Promise<Blob> {
  if (USE_MOCK) {
    await mockDelay(500);
    const report = getReportById(reportId);
    if (!report) throw new ApiError("Report not found", "NOT_FOUND", 404);
    return new Blob([report.content], { type: format === "md" ? "text/markdown" : "application/pdf" });
  }
  const res = await fetch(`${BASE_URL}/reports/${reportId}/export?format=${format}`);
  return res.blob();
}

// ─────────────────────────────────────────────
// Articles
// ─────────────────────────────────────────────

export async function getArticles(
  status?: string,
  search?: string,
  page: number = 1,
  limit: number = 20,
): Promise<PaginatedResponse<Article>> {
  if (USE_MOCK) {
    await mockDelay(300);
    let items = [...mockArticles];
    if (status) items = items.filter((a) => a.status === status);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter((a) => a.title.toLowerCase().includes(q));
    }
    return paginate(items, page, limit);
  }
  return api.get<PaginatedResponse<Article>>("/articles", { status, search, page, limit });
}

export async function getArticleByIdAPI(id: string): Promise<Article> {
  if (USE_MOCK) {
    await mockDelay(300);
    const article = getArticleById(id);
    if (!article) throw new ApiError("Article not found", "NOT_FOUND", 404);
    return article;
  }
  return api.get<Article>(`/articles/${id}`);
}

const EMPTY_BATCH_PROGRESS: BatchProgress = {
  isRunning: false,
  totalInBatch: 0,
  completed: 0,
  failed: 0,
  pending: 0,
  researching: 0,
  items: [],
};

/** Current article pipeline batch progress (filesystem-backed). */
export async function getBatchProgress(): Promise<BatchProgress> {
  if (USE_MOCK) {
    await mockDelay(100);
    return { ...EMPTY_BATCH_PROGRESS };
  }
  return api.get<BatchProgress>("/article-pipeline/progress");
}

/** Spawn `bin/article_pipeline.py run-one` (detached). */
export async function triggerPipelineRun(request: PipelineRunRequest): Promise<PipelineRunResult> {
  if (USE_MOCK) {
    await mockDelay(200);
    return {
      pid: undefined,
      startedAt: new Date().toISOString(),
      command: ["mock", "article_pipeline.py", "run-one", "--id", request.tweetId],
    };
  }
  return api.post<PipelineRunResult>("/article-pipeline/run", {
    mode: "one",
    tweetId: request.tweetId,
    model: request.model || undefined,
    noResearch: request.noResearch,
    noWrite: request.noWrite,
  });
}

/** Spawn `bin/article_pipeline.py run-batch` (detached). */
export async function triggerPipelineBatch(request: PipelineBatchRequest): Promise<PipelineRunResult> {
  if (USE_MOCK) {
    await mockDelay(200);
    return {
      pid: undefined,
      startedAt: new Date().toISOString(),
      command: ["mock", "article_pipeline.py", "run-batch"],
    };
  }
  return api.post<PipelineRunResult>("/article-pipeline/run", {
    mode: "batch",
    limit: request.limit,
    resume: request.resume,
    model: request.model || undefined,
  });
}

export async function createArticle(request: CreateArticleRequest): Promise<Article> {
  if (USE_MOCK) {
    await mockDelay(400);
    const newArticle: Article = {
      id: `art_${Date.now()}`,
      reportId: request.reportId,
      title: request.title,
      content: "# " + request.title + "\n\n## 引言\n\n",
      status: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: [],
      wordCount: 0,
    };
    mockArticles.push(newArticle);
    return newArticle;
  }
  return api.post<Article>("/articles", request);
}

export async function updateArticle(id: string, request: UpdateArticleRequest): Promise<Article> {
  if (USE_MOCK) {
    await mockDelay(300);
    const article = getArticleById(id);
    if (!article) throw new ApiError("Article not found", "NOT_FOUND", 404);
    if (request.title !== undefined) article.title = request.title;
    if (request.content !== undefined) article.content = request.content;
    if (request.status !== undefined) article.status = request.status;
    if (request.tags !== undefined) article.tags = request.tags;
    article.updatedAt = new Date().toISOString();
    article.wordCount = article.content.split(/\s+/).filter(Boolean).length;
    return article;
  }
  return api.put<Article>(`/articles/${id}`, request);
}

export async function getArticleVersions(articleId: string): Promise<ArticleVersion[]> {
  if (USE_MOCK) {
    await mockDelay(200);
    return mockArticleVersions.filter((v) => v.articleId === articleId);
  }
  return api.get<ArticleVersion[]>(`/articles/${articleId}/versions`);
}

export async function publishArticle(id: string, format: "markdown" | "html" | "wechat"): Promise<{ url: string }> {
  if (USE_MOCK) {
    await mockDelay(500);
    const article = getArticleById(id);
    if (article) {
      article.status = "published";
      article.publishedAt = new Date().toISOString();
    }
    return { url: `/articles/${id}.${format === "wechat" ? "html" : format}` };
  }
  return api.post<{ url: string }>(`/articles/${id}/publish`, { format } as PublishRequest);
}

// ─────────────────────────────────────────────
// Settings
// ─────────────────────────────────────────────

export async function getSettings(): Promise<Settings> {
  if (USE_MOCK) {
    await mockDelay(200);
    return { ...mockSettings };
  }
  return api.get<Settings>("/settings");
}

export async function updateSettings(request: UpdateSettingsRequest): Promise<Settings> {
  if (USE_MOCK) {
    await mockDelay(300);
    Object.assign(mockSettings, request);
    return { ...mockSettings };
  }
  return api.put<Settings>("/settings", request);
}

export async function updateApiKey(request: UpdateApiKeyRequest): Promise<{ success: boolean }> {
  if (USE_MOCK) {
    await mockDelay(300);
    return { success: true };
  }
  return api.put<{ success: boolean }>("/settings/api-key", request);
}

export async function testConnection(): Promise<ConnectionTestResult> {
  if (USE_MOCK) {
    await mockDelay(800);
    return { reachable: true, latency: 245 };
  }
  return api.post<ConnectionTestResult>("/settings/test-connection", {});
}

// ─────────────────────────────────────────────
// Logs
// ─────────────────────────────────────────────

export async function getLogs(query?: LogQuery): Promise<PaginatedResponse<LogEntry>> {
  if (USE_MOCK) {
    await mockDelay(200);
    let items = [...mockLogs];
    if (query?.component) items = items.filter((l) => l.component === query.component);
    if (query?.level) items = items.filter((l) => l.level === query.level);
    return paginate(items, query?.page ?? 1, query?.limit ?? 50);
  }
  return api.get<PaginatedResponse<LogEntry>>("/logs", query as Record<string, string | number>);
}
