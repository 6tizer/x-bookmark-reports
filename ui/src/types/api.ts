/**
 * x-bookmark-reports API Types
 * Shared between frontend and backend
 * CONTRACT v1.0
 */

// ─────────────────────────────────────────────
// 通用响应类型
// ─────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error?: {
    code: string;
    message: string;
    detail?: string;
  };
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sort?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// ─────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────

export type PipelineStage = "auth" | "fetching" | "parsing" | "storing" | "done";
export type PipelineStatus = "pending" | "running" | "completed" | "failed";

export interface PipelineNode {
  status: PipelineStatus;
  lastRun?: string;
  progress?: number;
  error?: { code: string; message: string };
}

/** Dashboard pipeline — four steps (Twitter → Deep → Rewrite → Notion) */
export interface DashboardPipelineFour {
  twitterSync: PipelineNode;
  deepReports: PipelineNode;
  rewrite: PipelineNode;
  notionUpload: PipelineNode;
}

/** @deprecated Use DashboardPipelineFour */
export interface DashboardPipelineSix {
  twitterSync: PipelineNode;
  deepReports: PipelineNode;
  metadata: PipelineNode;
  research: PipelineNode;
  rewrite: PipelineNode;
  notionUpload: PipelineNode;
}

/** @deprecated Use DashboardPipelineFour */
export interface DashboardPipelineThree {
  twitterSync: PipelineNode;
  deepReports: PipelineNode;
  notionUpload: PipelineNode;
}

export interface DashboardStats {
  lastSyncAt: string | null;
  totalDrafts: number;
  totalBookmarks: number;
  newThisWeek: number;
  articlesWritten: number;
  notionTotalUploaded: number;
  pendingRewrite: number;
  pipeline: DashboardPipelineFour;
  rettiwt?: RettiwtStatus | null;
}

export interface RettiwtStatus {
  localVersion: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
  error?: string;
  checkedAt: string;
}

export type ActivityType = "sync" | "read" | "report" | "article" | "setting";
export type ActivityAction = "started" | "completed" | "failed" | "updated";

export interface ActivityItem {
  id: string;
  type: ActivityType;
  action: ActivityAction;
  message: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

// ─────────────────────────────────────────────
// Bookmarks
// ─────────────────────────────────────────────

export type BookmarkStatus = "synced" | "read" | "reported" | "articled";
export type UrlCategory = "article" | "code" | "social" | "media" | "other" | "tweet";

export interface Author {
  name: string;
  handle: string;
  avatar?: string;
}

export interface TweetStats {
  likes: number;
  replies: number;
  bookmarks: number;
  views: number;
}

export interface Bookmark {
  id: string;
  url: string;
  author: Author;
  text: string;
  bookmarkedAt: string;
  syncBatchId: string;
  status: BookmarkStatus;
  tags: string[];
  urlCategory: UrlCategory;
  stats: TweetStats;
  reportPath?: string;
  enhancedReportPath?: string;
}

export interface ReplyThread {
  id: string;
  author: Author;
  text: string;
  stats: TweetStats;
  createdAt: string;
}

export interface ExternalLink {
  url: string;
  title: string;
  description?: string;
  category: UrlCategory;
}

export interface ReportSummary {
  id: string;
  type: "basic" | "enhanced";
  generatedAt: string;
  wordCount: number;
}

export interface BookmarkDetail extends Bookmark {
  fullText: string;
  replies: ReplyThread[];
  externalLinks: ExternalLink[];
  reports: {
    basic?: ReportSummary;
    enhanced?: ReportSummary;
  };
}

export interface BookmarkListQuery extends PaginationQuery {
  search?: string;
  status?: BookmarkStatus;
  tag?: string;
  urlCategory?: UrlCategory;
  author?: string;
}

export interface BatchReadRequest {
  ids: string[];
  type: "basic" | "enhanced";
}

export interface BatchReadResponse {
  jobId: string;
  status: "queued" | "running" | "completed" | "failed";
  total: number;
  completed: number;
  failed: number;
  results?: Array<{
    bookmarkId: string;
    success: boolean;
    error?: { code: string; message: string };
  }>;
}

// ─────────────────────────────────────────────
// Sync
// ─────────────────────────────────────────────

export type SyncMode = "incremental" | "full";
export type SyncStatus = "queued" | "running" | "completed" | "failed";

export interface SyncJob {
  id: string;
  mode: SyncMode;
  status: SyncStatus;
  progress: number;
  stage: PipelineStage;
  logs: string[];
  error?: {
    code: string;
    message: string;
    detail?: string;
  };
  startedAt: string;
  completedAt?: string;
  newCount: number;
  totalCount: number;
}

export interface SyncStartRequest {
  mode: SyncMode;
}

export interface SyncStartResponse {
  jobId: string;
  status: SyncStatus;
  mode: SyncMode;
  startedAt: string;
}

// SSE Event Types
export type SSEEventType = "progress" | "complete" | "error";

export interface SSEProgressPayload {
  percent: number;
  stage: PipelineStage;
  logs: string[];
  newCount?: number;
  totalCount?: number;
}

export interface SSECompletePayload {
  newCount: number;
  totalCount: number;
  completedAt: string;
}

export interface SSEErrorPayload {
  code: string;
  message: string;
  detail?: string;
}

export interface SSEEvent {
  type: SSEEventType;
  payload: SSEProgressPayload | SSECompletePayload | SSEErrorPayload;
}

// ─────────────────────────────────────────────
// Reports
// ─────────────────────────────────────────────

export type ReportType = "basic" | "enhanced";

export interface UrlSummary {
  url: string;
  title: string;
  category: UrlCategory;
}

export interface Report {
  id: string;
  bookmarkId: string;
  type: ReportType;
  title: string;
  content: string;
  generatedAt: string;
  wordCount: number;
  urlSummary: UrlSummary[];
}

export interface ReportListQuery extends PaginationQuery {
  bookmarkId?: string;
  author?: string;
  type?: ReportType;
  search?: string;
}

export interface ReportVersion {
  id: string;
  reportId: string;
  content: string;
  wordCount: number;
  createdAt: string;
  createdBy?: string;
}

export interface UpdateReportRequest {
  content: string;
  saveMode: "overwrite" | "version";
}

export interface DiffResult {
  additions: number;
  deletions: number;
  hunks: Array<{
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: string[];
  }>;
}

// ─────────────────────────────────────────────
// Articles
// ─────────────────────────────────────────────

/** Article pipeline statuses + DB/editor legacy (editing/reviewing/published) */
export type ArticleStatus =
  | "draft"
  | "metadata_done"
  | "researched"
  | "written"
  | "uploaded"
  | "failed"
  | "editing"
  | "reviewing"
  | "published";
export type ExportFormat = "markdown" | "html" | "wechat";

export interface Article {
  id: string;
  reportId?: string;
  title: string;
  content: string;
  status: ArticleStatus;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  tags: string[];
  wordCount: number;
  author?: string;
  sourceUrl?: string;
  notionIcon?: string;
  generatedAt?: string;
  lastError?: string;
}

export interface ArticleVersion {
  id: string;
  articleId: string;
  title: string;
  content: string;
  wordCount: number;
  createdAt: string;
  author?: string;
}

export interface CreateArticleRequest {
  reportId?: string;
  title: string;
}

export interface UpdateArticleRequest {
  title?: string;
  content?: string;
  status?: ArticleStatus;
  tags?: string[];
}

export interface PublishRequest {
  format: ExportFormat;
}

// ─────────────────────────────────────────────
// Article pipeline (trigger + progress)
// ─────────────────────────────────────────────

export interface PipelineRunRequest {
  tweetId: string;
  model?: string;
  noResearch?: boolean;
  noWrite?: boolean;
}

export interface PipelineBatchRequest {
  limit?: number;
  resume?: boolean;
  model?: string;
}

export interface BatchProgressItem {
  tweetId: string;
  title?: string;
  status: string;
  updatedAt: string;
  error?: string;
}

export interface BatchProgress {
  isRunning: boolean;
  currentTweetId?: string;
  currentStep?: "metadata" | "research" | "rewrite";
  totalInBatch: number;
  completed: number;
  failed: number;
  pending: number;
  researching: number;
  startedAt?: string;
  estimatedEnd?: string;
  items: BatchProgressItem[];
}

/** Response from POST /api/article-pipeline/run */
export interface PipelineRunResult {
  pid: number | undefined;
  startedAt: string;
  command: string[];
}

// ─────────────────────────────────────────────
// Settings
// ─────────────────────────────────────────────

export interface Settings {
  apiKey: string;        // 脱敏: abc****xyz
  proxy: string | null;
  dataPath: string;
  articlesDir: string;
  autoSync: boolean;
  cronExpression: string | null;
}

export interface UpdateSettingsRequest {
  proxy?: string | null;
  dataPath?: string;
  articlesDir?: string;
  autoSync?: boolean;
  cronExpression?: string | null;
}

export interface UpdateApiKeyRequest {
  apiKey: string;        // base64 encoded
}

export interface ConnectionTestResult {
  reachable: boolean;
  latency: number;
}

// ─────────────────────────────────────────────
// Logs
// ─────────────────────────────────────────────

export type LogLevel = "info" | "warn" | "error";
export type LogComponent = "sync" | "x-reader" | "x-tweet-reader" | "agent" | "system";

export interface LogEntry {
  id: string;
  component: LogComponent;
  level: LogLevel;
  message: string;
  detail?: string;
  timestamp: string;
}

export interface LogQuery extends PaginationQuery {
  component?: LogComponent;
  level?: LogLevel;
}

// ─────────────────────────────────────────────
// UI State (Zustand)
// ─────────────────────────────────────────────

export type ViewMode = "table" | "card";
export type Theme = "light" | "dark" | "system";

export interface UIState {
  sidebarOpen: boolean;
  theme: Theme;
  commandPaletteOpen: boolean;
}

// ─────────────────────────────────────────────
// Pipeline Control Center
// ─────────────────────────────────────────────

export type PipelineOperationType = "sync_bookmarks" | "article_pipeline" | "notion_upload";

export interface PipelineOperation {
  type: PipelineOperationType;
  pid?: number;
  startedAt: string;
  status: "running" | "completed" | "failed";
  command: string[];
  completedAt?: string;
  error?: string;
}

