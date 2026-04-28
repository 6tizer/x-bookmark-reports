-- x-bookmark-reports SQLite Schema
-- CONTRACT v1.0

-- ─────────────────────────────────────────────
-- 书签表
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookmarks (
  id TEXT PRIMARY KEY,              -- tweet_id
  url TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_handle TEXT NOT NULL,
  author_avatar TEXT,
  text TEXT NOT NULL,               -- 前200字摘要
  full_text TEXT,                   -- 完整原文
  bookmarked_at TEXT NOT NULL,      -- ISO 8601
  sync_batch_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'synced' CHECK (status IN ('synced', 'read', 'reported', 'articled')),
  tags TEXT DEFAULT '[]',           -- JSON array
  url_category TEXT DEFAULT 'other' CHECK (url_category IN ('article', 'code', 'social', 'media', 'other')),
  likes INTEGER DEFAULT 0,
  replies INTEGER DEFAULT 0,
  bookmarks INTEGER DEFAULT 0,
  views INTEGER DEFAULT 0,
  report_path TEXT,
  enhanced_report_path TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_status ON bookmarks(status);
CREATE INDEX IF NOT EXISTS idx_bookmarks_sync_batch ON bookmarks(sync_batch_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_bookmarked_at ON bookmarks(bookmarked_at);
CREATE INDEX IF NOT EXISTS idx_bookmarks_author ON bookmarks(author_handle);

-- ─────────────────────────────────────────────
-- 同步任务表
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_jobs (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('incremental', 'full')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  stage TEXT DEFAULT 'auth' CHECK (stage IN ('auth', 'fetching', 'parsing', 'storing', 'done')),
  logs TEXT DEFAULT '[]',           -- JSON array of strings
  error_code TEXT,
  error_message TEXT,
  error_detail TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  new_count INTEGER DEFAULT 0,
  total_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sync_jobs_status ON sync_jobs(status);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_started_at ON sync_jobs(started_at);

-- ─────────────────────────────────────────────
-- 报告表
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  bookmark_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('basic', 'enhanced')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,            -- Markdown 全文
  generated_at TEXT NOT NULL,
  word_count INTEGER DEFAULT 0,
  url_summary TEXT DEFAULT '[]',    -- JSON array
  file_path TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (bookmark_id) REFERENCES bookmarks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reports_bookmark ON reports(bookmark_id);
CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(type);

-- ─────────────────────────────────────────────
-- 报告版本表
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS report_versions (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  content TEXT NOT NULL,
  word_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  created_by TEXT,
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
);

-- ─────────────────────────────────────────────
-- 文章表
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  report_id TEXT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'editing', 'reviewing', 'published')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  published_at TEXT,
  tags TEXT DEFAULT '[]',
  word_count INTEGER DEFAULT 0,
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);

-- ─────────────────────────────────────────────
-- 文章版本表
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS article_versions (
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  word_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  author TEXT,
  FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
);

-- ─────────────────────────────────────────────
-- 活动日志表（Dashboard Feed + 通用日志）
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('sync', 'read', 'report', 'article', 'setting')),
  action TEXT NOT NULL CHECK (action IN ('started', 'completed', 'failed', 'updated')),
  message TEXT NOT NULL,
  metadata TEXT DEFAULT '{}',       -- JSON object
  timestamp TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_activities_timestamp ON activities(timestamp);
CREATE INDEX IF NOT EXISTS idx_activities_type ON activities(type);

-- ─────────────────────────────────────────────
-- 系统日志表
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS logs (
  id TEXT PRIMARY KEY,
  component TEXT NOT NULL CHECK (component IN ('sync', 'x-reader', 'x-tweet-reader', 'agent', 'system')),
  level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error')),
  message TEXT NOT NULL,
  detail TEXT,
  timestamp TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_logs_component ON logs(component);
CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);

-- ─────────────────────────────────────────────
-- 设置表（单条记录，id = 'default'）
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  api_key TEXT,                     -- 加密存储
  proxy TEXT,
  data_path TEXT DEFAULT './data',
  auto_sync INTEGER DEFAULT 0,
  cron_expression TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────
-- 回复线程表
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reply_threads (
  id TEXT PRIMARY KEY,
  bookmark_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_handle TEXT NOT NULL,
  text TEXT NOT NULL,
  likes INTEGER DEFAULT 0,
  replies INTEGER DEFAULT 0,
  bookmarks INTEGER DEFAULT 0,
  views INTEGER DEFAULT 0,
  created_at TEXT,
  FOREIGN KEY (bookmark_id) REFERENCES bookmarks(id) ON DELETE CASCADE
);

-- ─────────────────────────────────────────────
-- 外部链接表
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS external_links (
  id TEXT PRIMARY KEY,
  bookmark_id TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  description TEXT,
  category TEXT DEFAULT 'other' CHECK (category IN ('article', 'code', 'social', 'media', 'other')),
  FOREIGN KEY (bookmark_id) REFERENCES bookmarks(id) ON DELETE CASCADE
);

-- ─────────────────────────────────────────────
-- 初始化默认设置
-- ─────────────────────────────────────────────
INSERT OR IGNORE INTO settings (id, api_key, proxy, data_path, auto_sync, cron_expression)
VALUES ('default', NULL, NULL, './data', 0, '0 */6 * * *');
