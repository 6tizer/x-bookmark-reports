/**
 * Database Layer — better-sqlite3
 * CONTRACT v1.0
 */

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import type {
  Bookmark,
  BookmarkDetail,
  BookmarkStatus,
  UrlCategory,
  SyncJob,
  SyncMode,
  SyncStatus,
  Report,
  ReportType,
  ReportVersion,
  Article,
  ArticleStatus,
  ArticleVersion,
  ActivityItem,
  LogEntry,
  LogComponent,
  LogLevel,
  Settings,
  PaginatedResponse,
  PipelineStage,
} from "@/types/api";
import { getArticlesDir } from "@/lib/fs-data";
import { getRepoRoot, getUiPackageRoot } from "@/lib/repo-root";

// ─────────────────────────────────────────────
// Paths
// ─────────────────────────────────────────────

const UI_ROOT = getUiPackageRoot();
const DATA_DIR = path.join(UI_ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "x_bookmarks.db");
const SCHEMA_PATH = path.join(UI_ROOT, "src", "db", "schema.sql");
const PARENT_DIR = getRepoRoot();

// Ensure data dir exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ─────────────────────────────────────────────
// Connection + Schema
// ─────────────────────────────────────────────

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;

  const isNew = !fs.existsSync(DB_PATH);
  dbInstance = new Database(DB_PATH);
  dbInstance.pragma("journal_mode = WAL");
  dbInstance.pragma("foreign_keys = ON");

  if (isNew) {
    const schema = fs.readFileSync(SCHEMA_PATH, "utf-8");
    dbInstance.exec(schema);
    // Import existing bookmarks_*.json from parent directory
    importExistingBookmarks();
  }

  return dbInstance;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseJson<T>(val: string | null, fallback: T): T {
  if (!val) return fallback;
  try {
    return JSON.parse(val) as T;
  } catch {
    return fallback;
  }
}

function maskApiKey(key: string | null): string {
  if (!key || key.length < 8) return "****";
  return `${key.slice(0, 3)}****${key.slice(-3)}`;
}

// ─────────────────────────────────────────────
// Auto-import bookmarks_*.json
// ─────────────────────────────────────────────

function importExistingBookmarks(): void {
  let files: string[] = [];
  try {
    files = fs
      .readdirSync(PARENT_DIR)
      .filter((f) => f.startsWith("bookmarks_") && f.endsWith(".json"))
      .map((f) => path.join(PARENT_DIR, f));
  } catch {
    return;
  }
  if (files.length === 0) return;

  const db = getDb();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO bookmarks
     (id, url, author_name, author_handle, author_avatar, text, full_text, bookmarked_at, sync_batch_id, status, tags, url_category, likes, replies, bookmarks, views, report_path, enhanced_report_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  for (const file of files) {
    try {
      const raw = fs.readFileSync(file, "utf-8");
      const arr = JSON.parse(raw) as Array<Record<string, unknown>>;
      const batchId = `batch_${path.basename(file, ".json").replace("bookmarks_", "")}`;

      for (const item of arr) {
        const id = String(item.id ?? item.tweet_id ?? "");
        if (!id) continue;

        const author = (item.author ?? {}) as Record<string, unknown>;
        const stats = (item.stats ?? item.public_metrics ?? {}) as Record<string, unknown>;
        const url = String(
          item.url ?? `https://x.com/${author.handle ?? item.author_id}/status/${id}`
        );

        insert.run(
          id,
          url,
          String(author.name ?? "Unknown"),
          String(author.handle ?? "@unknown"),
          author.avatar ? String(author.avatar) : null,
          String(item.text ?? "").slice(0, 200),
          String(item.full_text ?? item.text ?? ""),
          String(item.bookmarked_at ?? item.created_at ?? nowIso()),
          batchId,
          String((item.status as string) ?? "synced"),
          JSON.stringify((item.tags as string[]) ?? []),
          String((item.url_category as string) ?? "other"),
          Number(stats.likes ?? stats.like_count ?? 0),
          Number(stats.replies ?? stats.reply_count ?? 0),
          Number(stats.bookmarks ?? stats.bookmark_count ?? 0),
          Number(stats.views ?? stats.impression_count ?? 0),
          item.report_path ? String(item.report_path) : null,
          item.enhanced_report_path ? String(item.enhanced_report_path) : null
        );
      }
    } catch (err) {
      console.error(`Failed to import ${file}:`, err);
    }
  }
}

// ─────────────────────────────────────────────
// Activity helpers
// ─────────────────────────────────────────────

export function logActivity(
  type: ActivityItem["type"],
  action: ActivityItem["action"],
  message: string,
  metadata?: Record<string, unknown>
): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO activities (id, type, action, message, metadata, timestamp)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(generateId("act"), type, action, message, JSON.stringify(metadata ?? {}), nowIso());
}

// ─────────────────────────────────────────────
// Bookmarks CRUD
// ─────────────────────────────────────────────

export function listBookmarks(
  page: number,
  limit: number,
  sort: string,
  search?: string,
  status?: BookmarkStatus,
  tag?: string,
  urlCategory?: UrlCategory,
  author?: string
): PaginatedResponse<Bookmark> {
  const db = getDb();
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (search) {
    conditions.push(
      `(author_name LIKE ? OR author_handle LIKE ? OR text LIKE ? OR full_text LIKE ?)`
    );
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }
  if (status) {
    conditions.push("status = ?");
    params.push(status);
  }
  if (tag) {
    conditions.push("tags LIKE ?");
    params.push(`%"${tag}"%`);
  }
  if (urlCategory) {
    conditions.push("url_category = ?");
    params.push(urlCategory);
  }
  if (author) {
    conditions.push("(author_name = ? OR author_handle = ?)");
    params.push(author, author);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const countStmt = db.prepare(`SELECT COUNT(*) as c FROM bookmarks ${where}`);
  const total = Number((countStmt.get(...params) as { c: number }).c);

  let orderBy = "bookmarked_at DESC";
  if (sort) {
    const [col, dir] = sort.split(":");
    const allowedCols = ["bookmarked_at", "likes", "replies", "bookmarks", "views", "created_at"];
    const allowedDirs = ["asc", "desc"];
    if (allowedCols.includes(col) && allowedDirs.includes(dir)) {
      orderBy = `${col} ${dir.toUpperCase()}`;
    }
  }

  const selectStmt = db.prepare(
    `SELECT * FROM bookmarks ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`
  );
  const rows = selectStmt.all(...params, limit, offset) as Array<Record<string, unknown>>;

  const items = rows.map(rowToBookmark);

  return {
    items,
    total,
    page,
    limit,
    hasMore: page * limit < total,
  };
}

export function getBookmarkById(id: string): Bookmark | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM bookmarks WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToBookmark(row) : null;
}

export function getBookmarkDetailById(id: string): BookmarkDetail | null {
  const bookmark = getBookmarkById(id);
  if (!bookmark) return null;

  const db = getDb();

  const replies = db
    .prepare("SELECT * FROM reply_threads WHERE bookmark_id = ? ORDER BY created_at")
    .all(id) as Array<Record<string, unknown>>;

  const externalLinks = db
    .prepare("SELECT * FROM external_links WHERE bookmark_id = ?")
    .all(id) as Array<Record<string, unknown>>;

  const basicReport = db
    .prepare("SELECT id, type, generated_at, word_count FROM reports WHERE bookmark_id = ? AND type = ?")
    .get(id, "basic") as Record<string, unknown> | undefined;

  const enhancedReport = db
    .prepare("SELECT id, type, generated_at, word_count FROM reports WHERE bookmark_id = ? AND type = ?")
    .get(id, "enhanced") as Record<string, unknown> | undefined;

  const fullRow = db
    .prepare("SELECT full_text FROM bookmarks WHERE id = ?")
    .get(id) as { full_text: string } | undefined;

  return {
    ...bookmark,
    fullText: fullRow?.full_text ?? bookmark.text,
    replies: replies.map((r) => ({
      id: String(r.id),
      author: {
        name: String(r.author_name),
        handle: String(r.author_handle),
      },
      text: String(r.text),
      stats: {
        likes: Number(r.likes),
        replies: Number(r.replies),
        bookmarks: Number(r.bookmarks),
        views: Number(r.views),
      },
      createdAt: String(r.created_at ?? nowIso()),
    })),
    externalLinks: externalLinks.map((l) => ({
      id: String(l.id),
      url: String(l.url),
      title: String(l.title ?? ""),
      description: l.description ? String(l.description) : undefined,
      category: String(l.category) as UrlCategory,
    })),
    reports: {
      basic: basicReport
        ? {
            id: String(basicReport.id),
            type: "basic",
            generatedAt: String(basicReport.generated_at),
            wordCount: Number(basicReport.word_count),
          }
        : undefined,
      enhanced: enhancedReport
        ? {
            id: String(enhancedReport.id),
            type: "enhanced",
            generatedAt: String(enhancedReport.generated_at),
            wordCount: Number(enhancedReport.word_count),
          }
        : undefined,
    },
  };
}

export function updateBookmarkTags(id: string, tags: string[]): boolean {
  const db = getDb();
  const result = db
    .prepare("UPDATE bookmarks SET tags = ?, updated_at = ? WHERE id = ?")
    .run(JSON.stringify(tags), nowIso(), id);
  return result.changes > 0;
}

export function updateBookmarkStatus(id: string, status: BookmarkStatus): boolean {
  const db = getDb();
  const result = db
    .prepare("UPDATE bookmarks SET status = ?, updated_at = ? WHERE id = ?")
    .run(status, nowIso(), id);
  return result.changes > 0;
}

export function updateBookmarkReportPaths(
  id: string,
  reportPath?: string,
  enhancedReportPath?: string
): boolean {
  const db = getDb();
  const fields: string[] = [];
  const values: Array<string | null> = [];
  if (reportPath !== undefined) {
    fields.push("report_path = ?");
    values.push(reportPath);
  }
  if (enhancedReportPath !== undefined) {
    fields.push("enhanced_report_path = ?");
    values.push(enhancedReportPath);
  }
  if (fields.length === 0) return false;
  fields.push("updated_at = ?");
  values.push(nowIso());
  values.push(id);
  const result = db
    .prepare(`UPDATE bookmarks SET ${fields.join(", ")} WHERE id = ?`)
    .run(...values);
  return result.changes > 0;
}

function rowToBookmark(row: Record<string, unknown>): Bookmark {
  return {
    id: String(row.id),
    url: String(row.url),
    author: {
      name: String(row.author_name),
      handle: String(row.author_handle),
      avatar: row.author_avatar ? String(row.author_avatar) : undefined,
    },
    text: String(row.text),
    bookmarkedAt: String(row.bookmarked_at),
    syncBatchId: String(row.sync_batch_id),
    status: String(row.status) as BookmarkStatus,
    tags: parseJson<string[]>(String(row.tags ?? "[]"), []),
    urlCategory: String(row.url_category) as UrlCategory,
    stats: {
      likes: Number(row.likes),
      replies: Number(row.replies),
      bookmarks: Number(row.bookmarks),
      views: Number(row.views),
    },
    reportPath: row.report_path ? String(row.report_path) : undefined,
    enhancedReportPath: row.enhanced_report_path ? String(row.enhanced_report_path) : undefined,
  };
}

// ─────────────────────────────────────────────
// Sync Jobs CRUD
// ─────────────────────────────────────────────

export function createSyncJob(mode: SyncMode): SyncJob {
  const db = getDb();
  const id = generateId("sync");
  const startedAt = nowIso();
  db.prepare(
    `INSERT INTO sync_jobs (id, mode, status, progress, stage, logs, started_at, new_count, total_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, mode, "queued", 0, "auth", "[]", startedAt, 0, 0);

  return {
    id,
    mode,
    status: "queued",
    progress: 0,
    stage: "auth",
    logs: [],
    startedAt,
    newCount: 0,
    totalCount: 0,
  };
}

export function getSyncJobById(id: string): SyncJob | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM sync_jobs WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToSyncJob(row) : null;
}

export function updateSyncJob(
  id: string,
  updates: Partial<{
    status: SyncStatus;
    progress: number;
    stage: PipelineStage;
    logs: string[];
    error: { code: string; message: string; detail?: string };
    completedAt: string;
    newCount: number;
    totalCount: number;
  }>
): boolean {
  const db = getDb();
  const fields: string[] = [];
  const values: Array<string | number | null> = [];

  if (updates.status !== undefined) {
    fields.push("status = ?");
    values.push(updates.status);
  }
  if (updates.progress !== undefined) {
    fields.push("progress = ?");
    values.push(updates.progress);
  }
  if (updates.stage !== undefined) {
    fields.push("stage = ?");
    values.push(updates.stage);
  }
  if (updates.logs !== undefined) {
    fields.push("logs = ?");
    values.push(JSON.stringify(updates.logs));
  }
  if (updates.error !== undefined) {
    fields.push("error_code = ?, error_message = ?, error_detail = ?");
    values.push(updates.error.code, updates.error.message, updates.error.detail ?? null);
  }
  if (updates.completedAt !== undefined) {
    fields.push("completed_at = ?");
    values.push(updates.completedAt);
  }
  if (updates.newCount !== undefined) {
    fields.push("new_count = ?");
    values.push(updates.newCount);
  }
  if (updates.totalCount !== undefined) {
    fields.push("total_count = ?");
    values.push(updates.totalCount);
  }

  if (fields.length === 0) return false;
  values.push(id);
  const result = db.prepare(`UPDATE sync_jobs SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  return result.changes > 0;
}

export function listSyncJobs(
  page: number,
  limit: number
): PaginatedResponse<SyncJob> {
  const db = getDb();
  const offset = (page - 1) * limit;
  const total = Number(
    (db.prepare("SELECT COUNT(*) as c FROM sync_jobs").get() as { c: number }).c
  );
  const rows = db
    .prepare("SELECT * FROM sync_jobs ORDER BY started_at DESC LIMIT ? OFFSET ?")
    .all(limit, offset) as Array<Record<string, unknown>>;

  return {
    items: rows.map(rowToSyncJob),
    total,
    page,
    limit,
    hasMore: page * limit < total,
  };
}

function rowToSyncJob(row: Record<string, unknown>): SyncJob {
  const errorCode = row.error_code ? String(row.error_code) : undefined;
  return {
    id: String(row.id),
    mode: String(row.mode) as SyncMode,
    status: String(row.status) as SyncStatus,
    progress: Number(row.progress),
    stage: String(row.stage) as PipelineStage,
    logs: parseJson<string[]>(String(row.logs ?? "[]"), []),
    error: errorCode
      ? {
          code: errorCode,
          message: String(row.error_message ?? ""),
          detail: row.error_detail ? String(row.error_detail) : undefined,
        }
      : undefined,
    startedAt: String(row.started_at),
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
    newCount: Number(row.new_count),
    totalCount: Number(row.total_count),
  };
}

// ─────────────────────────────────────────────
// Reports CRUD
// ─────────────────────────────────────────────

export function createReport(
  bookmarkId: string,
  type: ReportType,
  title: string,
  content: string,
  wordCount: number,
  urlSummary: Array<{ url: string; title: string; category: UrlCategory }>,
  filePath?: string
): Report {
  const db = getDb();
  const id = generateId("rep");
  const generatedAt = nowIso();
  db.prepare(
    `INSERT INTO reports (id, bookmark_id, type, title, content, generated_at, word_count, url_summary, file_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, bookmarkId, type, title, content, generatedAt, wordCount, JSON.stringify(urlSummary), filePath ?? null);

  return {
    id,
    bookmarkId,
    type,
    title,
    content,
    generatedAt,
    wordCount,
    urlSummary,
  };
}

export function getReportById(id: string): Report | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM reports WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToReport(row) : null;
}

export function updateReportContent(
  id: string,
  content: string,
  saveMode: "overwrite" | "version"
): { id: string; version: number; updatedAt: string } | null {
  const db = getDb();
  const existing = getReportById(id);
  if (!existing) return null;

  const wordCount = content.trim().split(/\s+/).length;
  const updatedAt = nowIso();

  if (saveMode === "version") {
    db.prepare(
      `INSERT INTO report_versions (id, report_id, content, word_count, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(generateId("ver"), id, existing.content, existing.wordCount, updatedAt);
  }

  db.prepare(
    `UPDATE reports SET content = ?, word_count = ?, updated_at = ? WHERE id = ?`
  ).run(content, wordCount, updatedAt, id);

  const versionCount = Number(
    (
      db
        .prepare("SELECT COUNT(*) as c FROM report_versions WHERE report_id = ?")
        .get(id) as { c: number }
    ).c
  );

  return { id, version: versionCount + 1, updatedAt };
}

export function listReports(
  page: number,
  limit: number,
  bookmarkId?: string,
  _author?: string,
  type?: ReportType,
  search?: string
): PaginatedResponse<Report> {
  const db = getDb();
  const offset = (page - 1) * limit;
  const conditions: string[] = [];
  const params: Array<string> = [];

  if (bookmarkId) {
    conditions.push("bookmark_id = ?");
    params.push(bookmarkId);
  }
  if (type) {
    conditions.push("type = ?");
    params.push(type);
  }
  if (search) {
    conditions.push("(title LIKE ? OR content LIKE ?)");
    const like = `%${search}%`;
    params.push(like, like);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const total = Number(
    (db.prepare(`SELECT COUNT(*) as c FROM reports ${where}`).get(...params) as { c: number }).c
  );

  const rows = db
    .prepare(`SELECT * FROM reports ${where} ORDER BY generated_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as Array<Record<string, unknown>>;

  return {
    items: rows.map(rowToReport),
    total,
    page,
    limit,
    hasMore: page * limit < total,
  };
}

export function getReportVersions(reportId: string): ReportVersion[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM report_versions WHERE report_id = ? ORDER BY created_at DESC")
    .all(reportId) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: String(r.id),
    reportId: String(r.report_id),
    content: String(r.content),
    wordCount: Number(r.word_count),
    createdAt: String(r.created_at),
    createdBy: r.created_by ? String(r.created_by) : undefined,
  }));
}

export function getReportsForBookmark(
  bookmarkId: string
): { basic?: Report; enhanced?: Report } {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM reports WHERE bookmark_id = ?")
    .all(bookmarkId) as Array<Record<string, unknown>>;
  const basic = rows.find((r) => r.type === "basic");
  const enhanced = rows.find((r) => r.type === "enhanced");
  return {
    basic: basic ? rowToReport(basic) : undefined,
    enhanced: enhanced ? rowToReport(enhanced) : undefined,
  };
}

function rowToReport(row: Record<string, unknown>): Report {
  return {
    id: String(row.id),
    bookmarkId: String(row.bookmark_id),
    type: String(row.type) as ReportType,
    title: String(row.title),
    content: String(row.content),
    generatedAt: String(row.generated_at),
    wordCount: Number(row.word_count),
    urlSummary: parseJson<Array<{ url: string; title: string; category: UrlCategory }>>(
      String(row.url_summary ?? "[]"),
      []
    ),
  };
}

// ─────────────────────────────────────────────
// Articles CRUD
// ─────────────────────────────────────────────

export function createArticle(reportId: string | undefined, title: string, content = ""): Article {
  const db = getDb();
  const id = generateId("art");
  const now = nowIso();
  const wordCount = content.trim().split(/\s+/).length || 0;
  db.prepare(
    `INSERT INTO articles (id, report_id, title, content, status, created_at, updated_at, tags, word_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, reportId ?? null, title, content, "draft", now, now, "[]", wordCount);

  return {
    id,
    reportId,
    title,
    content,
    status: "draft",
    createdAt: now,
    updatedAt: now,
    tags: [],
    wordCount,
  };
}

export function getArticleById(id: string): Article | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM articles WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToArticle(row) : null;
}

export function updateArticle(
  id: string,
  updates: Partial<{
    title: string;
    content: string;
    status: ArticleStatus;
    tags: string[];
  }>
): boolean {
  const db = getDb();
  const fields: string[] = [];
  const values: Array<string | number | null> = [];

  if (updates.title !== undefined) {
    fields.push("title = ?");
    values.push(updates.title);
  }
  if (updates.content !== undefined) {
    fields.push("content = ?, word_count = ?");
    values.push(updates.content, updates.content.trim().split(/\s+/).length);
  }
  if (updates.status !== undefined) {
    fields.push("status = ?");
    values.push(updates.status);
  }
  if (updates.tags !== undefined) {
    fields.push("tags = ?");
    values.push(JSON.stringify(updates.tags));
  }

  if (fields.length === 0) return false;
  fields.push("updated_at = ?");
  values.push(nowIso());
  values.push(id);

  const result = db.prepare(`UPDATE articles SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  return result.changes > 0;
}

export function publishArticle(id: string, _format: string): Article | null {
  const db = getDb();
  const now = nowIso();
  const result = db
    .prepare("UPDATE articles SET status = 'published', published_at = ?, updated_at = ? WHERE id = ?")
    .run(now, now, id);
  if (result.changes === 0) return null;
  return getArticleById(id);
}

export function listArticles(
  page: number,
  limit: number,
  status?: ArticleStatus,
  search?: string
): PaginatedResponse<Article> {
  const db = getDb();
  const offset = (page - 1) * limit;
  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (status) {
    conditions.push("status = ?");
    params.push(status);
  }
  if (search) {
    conditions.push("(title LIKE ? OR content LIKE ?)");
    const like = `%${search}%`;
    params.push(like, like);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const total = Number(
    (db.prepare(`SELECT COUNT(*) as c FROM articles ${where}`).get(...params) as { c: number }).c
  );

  const rows = db
    .prepare(`SELECT * FROM articles ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as Array<Record<string, unknown>>;

  return {
    items: rows.map(rowToArticle),
    total,
    page,
    limit,
    hasMore: page * limit < total,
  };
}

export function getArticleVersions(articleId: string): ArticleVersion[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM article_versions WHERE article_id = ? ORDER BY created_at DESC")
    .all(articleId) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: String(r.id),
    articleId: String(r.article_id),
    title: String(r.title),
    content: String(r.content),
    wordCount: Number(r.word_count),
    createdAt: String(r.created_at),
    author: r.author ? String(r.author) : undefined,
  }));
}

export function createArticleVersion(articleId: string, title: string, content: string, author?: string): void {
  const db = getDb();
  const wordCount = content.trim().split(/\s+/).length;
  db.prepare(
    `INSERT INTO article_versions (id, article_id, title, content, word_count, created_at, author)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(generateId("ver"), articleId, title, content, wordCount, nowIso(), author ?? null);
}

function rowToArticle(row: Record<string, unknown>): Article {
  return {
    id: String(row.id),
    reportId: row.report_id ? String(row.report_id) : undefined,
    title: String(row.title),
    content: String(row.content),
    status: String(row.status) as ArticleStatus,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    publishedAt: row.published_at ? String(row.published_at) : undefined,
    tags: parseJson<string[]>(String(row.tags ?? "[]"), []),
    wordCount: Number(row.word_count),
  };
}

// ─────────────────────────────────────────────
// Activities CRUD
// ─────────────────────────────────────────────

export function listActivities(limit: number): { items: ActivityItem[]; total: number } {
  const db = getDb();
  const total = Number(
    (db.prepare("SELECT COUNT(*) as c FROM activities").get() as { c: number }).c
  );
  const rows = db
    .prepare("SELECT * FROM activities ORDER BY timestamp DESC LIMIT ?")
    .all(limit) as Array<Record<string, unknown>>;

  return {
    items: rows.map((r) => ({
      id: String(r.id),
      type: String(r.type) as ActivityItem["type"],
      action: String(r.action) as ActivityItem["action"],
      message: String(r.message),
      metadata: parseJson<Record<string, unknown>>(String(r.metadata ?? "{}"), {}),
      timestamp: String(r.timestamp),
    })),
    total,
  };
}

// ─────────────────────────────────────────────
// Logs CRUD
// ─────────────────────────────────────────────

export function createLog(
  component: LogComponent,
  level: LogLevel,
  message: string,
  detail?: string
): LogEntry {
  const db = getDb();
  const id = generateId("log");
  const timestamp = nowIso();
  db.prepare(
    `INSERT INTO logs (id, component, level, message, detail, timestamp)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, component, level, message, detail ?? null, timestamp);

  // Also write to file
  writeLogToFile(component, level, message, detail, timestamp);

  return { id, component, level, message, detail, timestamp };
}

function writeLogToFile(
  component: string,
  level: string,
  message: string,
  detail?: string,
  timestamp?: string
): void {
  const logDir = path.join(DATA_DIR, "logs");
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  const date = (timestamp ?? nowIso()).slice(0, 10);
  const logFile = path.join(logDir, `${date}.log`);
  const line = `[${timestamp ?? nowIso()}] [${component}] [${level}] ${message}${detail ? ` | ${detail}` : ""}\n`;
  fs.appendFileSync(logFile, line);
}

export function listLogs(
  page: number,
  limit: number,
  component?: LogComponent,
  level?: LogLevel
): PaginatedResponse<LogEntry> {
  const db = getDb();
  const offset = (page - 1) * limit;
  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (component) {
    conditions.push("component = ?");
    params.push(component);
  }
  if (level) {
    conditions.push("level = ?");
    params.push(level);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const total = Number(
    (db.prepare(`SELECT COUNT(*) as c FROM logs ${where}`).get(...params) as { c: number }).c
  );

  const rows = db
    .prepare(`SELECT * FROM logs ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as Array<Record<string, unknown>>;

  return {
    items: rows.map((r) => ({
      id: String(r.id),
      component: String(r.component) as LogComponent,
      level: String(r.level) as LogLevel,
      message: String(r.message),
      detail: r.detail ? String(r.detail) : undefined,
      timestamp: String(r.timestamp),
    })),
    total,
    page,
    limit,
    hasMore: page * limit < total,
  };
}

// ─────────────────────────────────────────────
// Settings CRUD
// ─────────────────────────────────────────────

export function getSettings(): Settings {
  const db = getDb();
  const row = db.prepare("SELECT * FROM settings WHERE id = 'default'").get() as
    | Record<string, unknown>
    | undefined;

  if (!row) {
    return {
      apiKey: "****",
      proxy: null,
      dataPath: "./data",
      articlesDir: getArticlesDir(),
      autoSync: false,
      cronExpression: "0 */6 * * *",
    };
  }

  return {
    apiKey: maskApiKey(row.api_key ? String(row.api_key) : null),
    proxy: row.proxy ? String(row.proxy) : null,
    dataPath: String(row.data_path ?? "./data"),
    articlesDir: getArticlesDir(),
    autoSync: Boolean(row.auto_sync),
    cronExpression: row.cron_expression ? String(row.cron_expression) : null,
  };
}

export function updateSettings(
  updates: Partial<{
    proxy: string | null;
    dataPath: string;
    autoSync: boolean;
    cronExpression: string | null;
  }>
): boolean {
  const db = getDb();
  const fields: string[] = [];
  const values: Array<string | number | null> = [];

  if (updates.proxy !== undefined) {
    fields.push("proxy = ?");
    values.push(updates.proxy ?? null);
  }
  if (updates.dataPath !== undefined) {
    fields.push("data_path = ?");
    values.push(updates.dataPath);
  }
  if (updates.autoSync !== undefined) {
    fields.push("auto_sync = ?");
    values.push(updates.autoSync ? 1 : 0);
  }
  if (updates.cronExpression !== undefined) {
    fields.push("cron_expression = ?");
    values.push(updates.cronExpression ?? null);
  }

  if (fields.length === 0) return false;
  fields.push("updated_at = ?");
  values.push(nowIso());
  values.push("default");

  const result = db
    .prepare(`UPDATE settings SET ${fields.join(", ")} WHERE id = ?`)
    .run(...values);
  return result.changes > 0;
}

export function updateApiKey(apiKey: string): boolean {
  const db = getDb();
  const result = db
    .prepare("UPDATE settings SET api_key = ?, updated_at = ? WHERE id = 'default'")
    .run(apiKey, nowIso());
  return result.changes > 0;
}

export function getRawApiKey(): string | null {
  const db = getDb();
  const row = db
    .prepare("SELECT api_key FROM settings WHERE id = 'default'")
    .get() as { api_key: string | null } | undefined;
  return row?.api_key ?? null;
}

// ─────────────────────────────────────────────
// DB Empty Check
// ─────────────────────────────────────────────

export function isDbEmpty(): boolean {
  const outDir = path.join(PARENT_DIR, "output");
  try {
    if (fs.existsSync(outDir)) {
      const hasMd = fs.readdirSync(outDir).some((f) => f.endsWith(".md"));
      if (hasMd) return true;
    }
  } catch {
    /* ignore */
  }
  const db = getDb();
  const count = Number(
    (db.prepare("SELECT COUNT(*) as c FROM bookmarks").get() as { c: number }).c
  );
  return count === 0;
}
