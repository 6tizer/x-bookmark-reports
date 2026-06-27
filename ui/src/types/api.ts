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
  progressGlobal?: number;            // 新增：全局进度（相对 1584 的百分比）
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
  totalBookmarks: number;             // 1584 (bookmarks.json length)
  totalDrafts: number;                // 642 (deep drafts)
  totalArticlesLocal: number;         // 642 (article-final/*.md)
  totalArticlesNotion: number;        // Notion DB total
  pendingRewriteLocal: number;        // max(0, drafts - articlesLocal)
  pendingRewriteGlobal: number;       // max(0, bookmarks - drafts)
  newThisWeek: number;
  pipeline: DashboardPipelineFour;
  rettiwt?: RettiwtStatus | null;
  // 旧字段保留兼容（同义别名）
  articlesWritten: number;            // = totalArticlesLocal
  notionTotalUploaded: number;        // = totalArticlesNotion
  pendingRewrite: number;             // = pendingRewriteGlobal
}

export interface RettiwtStatus {
  localVersion: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
  error?: string;
  checkedAt: string;
}

// Stage 4：fs 派生活动事件新增 4 种 type（来自 state 文件 last_run_* 字段）
// 原 5 种 type（sync/read/report/article/setting）保留，DB 真值模式仍使用
export type ActivityType =
  | "sync"
  | "read"
  | "report"
  | "article"
  | "setting"
  | "coordinator"
  | "article_pipeline"
  | "notion_upload"
  | "auto_run";
export type ActivityAction = "started" | "completed" | "failed" | "updated";

export interface ActivityItem {
  id: string;
  type: ActivityType;
  action: ActivityAction;
  message: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
  // Stage 4：fs 派生活动事件附加字段（DB 模式可留空）
  step?: string;                       // auto_run_state 的 step（sync/process/upload/done）
  status?: string;                     // last_run_status 原值（success/failed/running）
  title?: string;                      // 人类可读标题（如 "Coordinator deep-batch run"）
}

// ─────────────────────────────────────────────
// Bookmarks
// ─────────────────────────────────────────────

export type BookmarkStatus = "synced" | "read" | "reported" | "articled";
export type UrlCategory = "article" | "code" | "social" | "media" | "other" | "tweet";

// V2 lifecycle（基于 bookmarks.json 真相源 + 三集合 join）
export type BookmarkLifecycle = "pending" | "drafted" | "written" | "uploaded";

// V2 bookmark：在 V1 之上加 lifecycle / tweetId / 三态标记 / 文章 tags
export interface BookmarkV2 extends Bookmark {
  tweetId: string;
  lifecycle: BookmarkLifecycle;
  hasDeepDraft: boolean;
  hasArticle: boolean;
  inNotion: boolean;
  articleTags?: string[];
}

// V2 bookmark 详情：补充 fullText / 三态文件路径 / Notion page URL
export interface BookmarkDetailV2 extends BookmarkV2 {
  fullText: string;
  deepDraftPath?: string;
  articlePath?: string;
  notionPageUrl?: string;
}

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
  // V2 可选扩展（API 返回 BookmarkV2 时填，V1 mock/DB 模式可留空）
  tweetId?: string;
  lifecycle?: BookmarkLifecycle;
  hasDeepDraft?: boolean;
  hasArticle?: boolean;
  inNotion?: boolean;
  articleTags?: string[];
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
  // V2 扩展（详情专用，fs-data 路径下填充）
  deepDraftPath?: string;
  articlePath?: string;
  notionPageUrl?: string;
  deepDraftBody?: string;
}

export interface BookmarkListQuery extends PaginationQuery {
  search?: string;
  status?: BookmarkStatus;
  tag?: string;
  urlCategory?: UrlCategory;
  author?: string;
  lifecycle?: BookmarkLifecycle;   // Stage 3: V2 lifecycle 过滤（仅 fs 分支生效）
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

/** Article pipeline 状态（fs 数据层支持的 6 种；editing/reviewing/published 在 fs-only 模式下不产生） */
export type ArticleStatus =
  | "draft"
  | "metadata_done"
  | "researched"
  | "written"
  | "uploaded"
  | "failed";
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
  // API Keys (masked in GET responses)
  twitterApiKey: string;
  notionToken: string;
  notionDbId: string;
  deepseekApiKey: string;
  deepseekBaseUrl: string;
  deepseekModel: string;
  xaiApiKey: string;
  xaiBaseUrl: string;
  xaiModel: string;
  exaApiKey: string;
  exaBaseUrl: string;
  // Paths
  bookmarksPath: string;
  articlesDir: string;
  dataPath: string;
  proxy: string | null;
  // Toggles
  /** @deprecated Auto Sync 已删除（PR-3），保留字段供旧 UI 兼容，后端恒返回 false */
  autoSync: boolean;
  notionUploadLive: boolean;
  /** @deprecated cron env 已删除（PR-3），保留字段供旧 UI 兼容，后端恒返回 null */
  cronExpression: string | null;
}

export interface UpdateSettingsRequest {
  proxy?: string | null;
  dataPath?: string;
  articlesDir?: string;
  bookmarksPath?: string;
  /** @deprecated Auto Sync 已删除（PR-3），后端忽略该字段 */
  autoSync?: boolean;
  notionUploadLive?: boolean;
  /** @deprecated cron env 已删除（PR-3），后端忽略该字段 */
  cronExpression?: string | null;
  notionDbId?: string;
  deepseekBaseUrl?: string;
  deepseekModel?: string;
  xaiBaseUrl?: string;
  xaiModel?: string;
  exaBaseUrl?: string;
}

export type ApiKeyName = "TWITTER_API_IO_KEY" | "NOTION_TOKEN" | "DEEPSEEK_API_KEY" | "XAI_API_KEY" | "EXA_API_KEY";

export interface UpdateApiKeyRequest {
  keyName: ApiKeyName;
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
export type LogComponent = "sync" | "x-reader" | "x-tweet-reader" | "agent" | "system" | "coordinator" | "article_pipeline" | "notion_upload";

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
  /** SSE 订阅的 component 名（spawn 时根据 type 设置，用于 SyncTerminal 订阅 /api/logs/stream） */
  component?: LogComponent;
}

