/**
 * Filesystem Data Layer — reads from x-bookmark-reports output directories
 * Replaces SQLite/mock data with direct file reading.
 * CONTRACT v1.0
 */

import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
import type { DashboardPipelineThree, PipelineNode } from "@/types/api";
import { getRepoRoot } from "@/lib/repo-root";

// ─────────────────────────────────────────────
// Paths — repo root (works when cwd is `ui/` or repo root)
// ─────────────────────────────────────────────

const REPO_ROOT = getRepoRoot();
const OUTPUT_DIR = path.join(REPO_ROOT, "output");

const DEFAULT_ARTICLES_DIR =
  "/Users/tizer_mac_studio/Library/Mobile Documents/com~apple~CloudDocs/Hermes/bookmark-articles";

function readArticlesDirFromParentEnv(): string | null {
  const envPath = path.join(REPO_ROOT, ".env");
  if (!fs.existsSync(envPath)) return null;
  try {
    const parsed = dotenv.parse(fs.readFileSync(envPath, "utf-8"));
    const v = parsed.ARTICLES_DIR?.trim();
    return v || null;
  } catch {
    return null;
  }
}

/** Resolved articles directory: env → repo `.env` → iCloud Hermes default */
export function getArticlesDir(): string {
  const fromProc = process.env.ARTICLES_DIR?.trim();
  if (fromProc) return fromProc;
  const fromFile = readArticlesDirFromParentEnv();
  if (fromFile) return fromFile;
  return DEFAULT_ARTICLES_DIR;
}

function getProcessedFile(): string {
  return path.join(getArticlesDir(), "processed.json");
}

function loadProcessedSet(): Set<string> {
  try {
    const processedPath = getProcessedFile();
    if (!fs.existsSync(processedPath)) return new Set();
    const raw = JSON.parse(fs.readFileSync(processedPath, "utf-8"));
    if (Array.isArray(raw)) return new Set(raw.map(String));
    if (typeof raw === "object" && raw !== null) return new Set(Object.keys(raw));
    return new Set();
  } catch {
    return new Set();
  }
}

/**
 * Draft bookmark title: **bold** line → `#` H1 → `##` H2 → first non-empty (80 chars) → basename.
 */
export function extractTitle(body: string, filename: string): string {
  const lines = body.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (
      trimmed.startsWith("**") &&
      trimmed.endsWith("**") &&
      trimmed.length > 4
    ) {
      return trimmed.replace(/\*\*/g, "").trim();
    }
  }
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^#\s+/.test(trimmed) && !/^##/.test(trimmed)) {
      return trimmed.replace(/^#\s+/, "").trim();
    }
  }
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^##\s+/.test(trimmed)) {
      return trimmed.replace(/^##\s+/, "").trim();
    }
  }
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) return trimmed.slice(0, 80);
  }
  return filename.replace(/\.md$/i, "");
}

/** Article title: first ATX H1 in content; else basename keeping hyphens */
export function extractArticleTitle(content: string, filename: string): string {
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (/^#\s+/.test(t) && !/^##/.test(t)) {
      return t.replace(/^#\s+/, "").trim();
    }
  }
  return filename.replace(/\.md$/i, "");
}

function articleBasenameNoExt(file: string): string {
  return file.replace(/\.md$/i, "");
}

// ─────────────────────────────────────────────
// Frontmatter parser for draft .md files
// ─────────────────────────────────────────────

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  if (!raw.startsWith("---")) {
    return { meta: {}, body: raw };
  }
  const end = raw.indexOf("---", 3);
  if (end === -1) {
    return { meta: {}, body: raw };
  }
  const header = raw.slice(3, end).trim();
  const body = raw.slice(end + 3).trimStart();
  const meta: Record<string, string> = {};
  for (const line of header.split("\n")) {
    const colon = line.indexOf(":");
    if (colon > -1) {
      meta[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
    }
  }
  return { meta, body };
}

function getTweetUrlFromBody(body: string): string | null {
  const match = body.match(/原文推文[：:]\s*(https?:\/\/\S+)/);
  return match ? match[1] : null;
}

function parseStats(statsStr: string): {
  likes: number;
  retweets: number;
  bookmarks: number;
  views: number;
  replies: number;
} {
  const emojis: Record<string, number> = { "❤️": 0, "↻": 0, "🔖": 0, "👁": 0, "💬": 0 };
  for (const emoji of Object.keys(emojis)) {
    const idx = statsStr.indexOf(emoji);
    if (idx > -1) {
      let num = "";
      for (let i = idx - 1; i >= 0 && statsStr[i] >= "0" && statsStr[i] <= "9"; i--) {
        num = statsStr[i] + num;
      }
      if (num) emojis[emoji] = parseInt(num, 10);
    }
  }
  return {
    likes: emojis["❤️"],
    retweets: emojis["↻"],
    bookmarks: emojis["🔖"],
    views: emojis["👁"],
    replies: emojis["💬"],
  };
}

function parseAuthorLine(authorStr: string): { handle: string; name: string } {
  const match = authorStr.match(/@(\S+)\s*\(([^)]+)\)/);
  if (match) {
    return { handle: match[1], name: match[2] || match[1] };
  }
  return { handle: authorStr.replace("@", ""), name: authorStr };
}

// ─────────────────────────────────────────────
// Bookmark (draft) type
// ─────────────────────────────────────────────

export interface FsBookmark {
  id: string;
  fileName: string;
  url: string;
  author: { name: string; handle: string; avatar?: string };
  text: string;
  fullText: string;
  bookmarkedAt: string;
  publishedAt: string;
  stats: { likes: number; retweets: number; bookmarks: number; views: number; replies: number };
  status: "synced" | "read" | "reported" | "articled";
  tags: string[];
  draftPath: string;
  body?: string;
  externalLinks?: Array<{ url: string; title: string; description?: string; contentType?: string }>;
}

export interface FsArticle {
  id: string;
  fileName: string;
  title: string;
  content: string;
  wordCount: number;
  publishedAt: string;
  status: "draft" | "published";
  draftRef?: string;
  draftPath?: string;
}

// ─────────────────────────────────────────────
// Read draft bookmarks
// ─────────────────────────────────────────────

export function listDraftBookmarks(
  page: number = 1,
  limit: number = 20,
  search?: string,
  status?: string
): { items: FsBookmark[]; total: number; hasMore: boolean } {
  if (!fs.existsSync(OUTPUT_DIR)) {
    return { items: [], total: 0, hasMore: false };
  }
  const files = fs.readdirSync(OUTPUT_DIR).filter((f) => f.endsWith(".md"));
  let drafts: FsBookmark[] = [];
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(OUTPUT_DIR, file), "utf-8");
      const { meta, body } = parseFrontmatter(content);
      let draftBody = body || meta.body || "";
      const stats = parseStats(meta.Stats || "");
      const author = parseAuthorLine(meta.Author || "@unknown (Unknown)");
      const tweetUrl = getTweetUrlFromBody(body) || `https://x.com/${author.handle}/status/${file}`;
      const bookmarkedAt = meta.PublishedAt || new Date().toISOString();
      const publishedAt = meta.PublishedAt || new Date().toISOString();
      const title = extractTitle(draftBody, file);
      drafts.push({
        id: file.replace(".md", ""),
        fileName: file,
        url: tweetUrl || `https://x.com/${author.handle}/status/${file}`,
        author,
        text: title.slice(0, 200),
        fullText: draftBody,
        bookmarkedAt,
        publishedAt,
        stats,
        status: "synced" as const,
        tags: [],
        draftPath: path.join(OUTPUT_DIR, file),
        body: draftBody,
      });
    } catch {
      /* skip bad files */
    }
  }
  if (status) {
    drafts = drafts.filter((d) => d.status === status);
  }
  if (search) {
    const s = search.toLowerCase();
    drafts = drafts.filter(
      (d) =>
        d.author.name.toLowerCase().includes(s) ||
        d.author.handle.toLowerCase().includes(s) ||
        d.text.toLowerCase().includes(s)
    );
  }
  drafts.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  const total = drafts.length;
  const offset = (page - 1) * limit;
  const items = drafts.slice(offset, offset + limit);
  return { items, total, hasMore: page * limit < total };
}

// ─────────────────────────────────────────────
// Read final articles
// ─────────────────────────────────────────────

function isArticlePublished(file: string, processed: Set<string>): boolean {
  const id = articleBasenameNoExt(file);
  return processed.has(file) || processed.has(id);
}

export function listArticles(
  page: number = 1,
  limit: number = 20,
  status?: string
): { items: FsArticle[]; total: number; hasMore: boolean } {
  const articlesDir = getArticlesDir();
  if (!fs.existsSync(articlesDir)) {
    return { items: [], total: 0, hasMore: false };
  }
  const processed = loadProcessedSet();
  const files = fs.readdirSync(articlesDir).filter((f) => f.endsWith(".md"));
  let articles: FsArticle[] = [];
  for (const file of files) {
    try {
      const full = path.join(articlesDir, file);
      const content = fs.readFileSync(full, "utf-8");
      const st = fs.statSync(full);
      const publishedAt = new Date(st.mtimeMs).toISOString();
      const words = content.split(/\s+/).filter(Boolean).length;
      const pub = isArticlePublished(file, processed);
      articles.push({
        id: articleBasenameNoExt(file),
        fileName: file,
        title: extractArticleTitle(content, file),
        content,
        wordCount: words,
        publishedAt,
        status: pub ? "published" : "draft",
      });
    } catch {
      /* skip */
    }
  }
  if (status) {
    articles = articles.filter((a) => a.status === status);
  }
  articles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  const total = articles.length;
  const offset = (page - 1) * limit;
  const items = articles.slice(offset, offset + limit);
  return { items, total, hasMore: page * limit < total };
}

export function getArticleById(id: string): FsArticle | null {
  const articlesDir = getArticlesDir();
  if (!fs.existsSync(articlesDir)) return null;
  const file = fs.readdirSync(articlesDir).find((f) => articleBasenameNoExt(f) === id);
  if (!file) return null;
  const full = path.join(articlesDir, file);
  const content = fs.readFileSync(full, "utf-8");
  const st = fs.statSync(full);
  const processed = loadProcessedSet();
  const pub = isArticlePublished(file, processed);
  return {
    id: articleBasenameNoExt(file),
    fileName: file,
    title: extractArticleTitle(content, file),
    content,
    wordCount: content.split(/\s+/).filter(Boolean).length,
    publishedAt: new Date(st.mtimeMs).toISOString(),
    status: pub ? "published" : "draft",
  };
}

// ─────────────────────────────────────────────
// Dashboard — file-backed stats
// ─────────────────────────────────────────────

export interface FsDashboardStats {
  totalDrafts: number;
  totalArticles: number;
  notionUploaded: number;
  pendingRewrite: number;
  newThisWeek: number;
  lastSync: string | null;
}

function countOutputDrafts(): { total: number; newThisWeek: number } {
  let total = 0;
  let newThisWeek = 0;
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - weekMs;
  if (!fs.existsSync(OUTPUT_DIR)) return { total: 0, newThisWeek: 0 };
  for (const f of fs.readdirSync(OUTPUT_DIR)) {
    if (!f.endsWith(".md")) continue;
    total++;
    try {
      const st = fs.statSync(path.join(OUTPUT_DIR, f));
      if (st.mtimeMs >= cutoff) newThisWeek++;
    } catch {
      /* ignore */
    }
  }
  return { total, newThisWeek };
}

function countNotionUploaded(): number {
  const notionPath = path.join(OUTPUT_DIR, ".notion-upload-state.json");
  if (!fs.existsSync(notionPath)) return 0;
  try {
    const raw = JSON.parse(fs.readFileSync(notionPath, "utf-8"));
    if (Array.isArray(raw.uploaded)) return raw.uploaded.length;
    if (typeof raw === "object" && raw !== null) return Object.keys(raw).length;
  } catch {
    /* ignore */
  }
  return 0;
}

function readAutoRunState(): Record<string, unknown> {
  const autoPath = path.join(OUTPUT_DIR, "auto_run_state.json");
  if (!fs.existsSync(autoPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(autoPath, "utf-8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function readDeepRunState(): {
  completed_ids: string[];
  last_run: string;
  errors: unknown[];
} {
  const p = path.join(OUTPUT_DIR, ".deep-run-state.json");
  if (!fs.existsSync(p)) {
    return { completed_ids: [], last_run: "", errors: [] };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf-8")) as Record<string, unknown>;
    return {
      completed_ids: Array.isArray(raw.completed_ids)
        ? (raw.completed_ids as string[]).map(String)
        : [],
      last_run: typeof raw.last_run === "string" ? raw.last_run : "",
      errors: Array.isArray(raw.errors) ? raw.errors : [],
    };
  } catch {
    return { completed_ids: [], last_run: "", errors: [] };
  }
}

export function getDashboardStats(): FsDashboardStats {
  const { total: totalDrafts, newThisWeek } = countOutputDrafts();
  const articlesDir = getArticlesDir();
  let totalArticles = 0;
  if (fs.existsSync(articlesDir)) {
    totalArticles = fs.readdirSync(articlesDir).filter((f) => f.endsWith(".md")).length;
  }
  const notionUploaded = countNotionUploaded();
  const auto = readAutoRunState();
  const lastSync = typeof auto.last_run === "string" ? auto.last_run : null;
  const pendingRewrite = Math.max(0, totalDrafts - totalArticles);

  return {
    totalDrafts,
    totalArticles,
    notionUploaded,
    pendingRewrite,
    newThisWeek,
    lastSync,
  };
}

type PipelineStatus = "pending" | "running" | "completed" | "failed";

function node(
  status: PipelineStatus,
  lastRun?: string,
  progress?: number,
  err?: { code: string; message: string }
): PipelineNode {
  const n: PipelineNode = { status };
  if (lastRun) n.lastRun = lastRun;
  if (progress !== undefined) n.progress = progress;
  if (err) n.error = err;
  return n;
}

/** Three-step pipeline: Twitter Sync → Deep Reports → Notion Upload */
export function getPipelineStatus(): DashboardPipelineThree {
  const { total: totalDrafts } = countOutputDrafts();
  const auto = readAutoRunState();
  const deep = readDeepRunState();
  const notionCount = countNotionUploaded();

  const st = String(auto.status ?? "");
  const step = String(auto.step ?? "");
  const lastRun = typeof auto.last_run === "string" ? auto.last_run : undefined;
  const errMsg = typeof auto.error === "string" && auto.error ? auto.error : "Pipeline error";

  const deepDone = deep.completed_ids.length;
  const deepProgress =
    totalDrafts > 0 ? Math.min(100, Math.round((deepDone / totalDrafts) * 100)) : deepDone > 0 ? 100 : 0;
  const notionProgress =
    totalDrafts > 0 ? Math.min(100, Math.round((notionCount / totalDrafts) * 100)) : 0;

  let twitterSync: PipelineNode;
  if (!lastRun) {
    twitterSync = node("pending");
  } else if (st === "running" && (step === "proxy_check" || step === "sync")) {
    twitterSync = node("running", lastRun, step === "proxy_check" ? 15 : 55);
  } else if (st === "failed" && (step === "proxy_check" || step === "sync")) {
    twitterSync = node("failed", lastRun, undefined, { code: "SYNC_FAILED", message: errMsg });
  } else {
    twitterSync = node("completed", lastRun, 100);
  }

  let deepReports: PipelineNode;
  if (st === "running" && step === "process") {
    deepReports = node("running", deep.last_run || lastRun, deepProgress);
  } else if (st === "failed" && step === "process") {
    deepReports = node("failed", deep.last_run || lastRun, deepProgress, {
      code: "DEEP_FAILED",
      message: errMsg,
    });
  } else if (totalDrafts > 0 && deepDone >= totalDrafts) {
    deepReports = node("completed", deep.last_run || lastRun, 100);
  } else if (deepDone > 0) {
    deepReports = node("running", deep.last_run || lastRun, deepProgress);
  } else if (twitterSync.status === "completed") {
    deepReports = node("pending", deep.last_run || undefined, 0);
  } else {
    deepReports = node("pending");
  }

  let notionUpload: PipelineNode;
  if (st === "running" && step === "upload") {
    notionUpload = node("running", lastRun, notionProgress);
  } else if (st === "failed" && step === "upload") {
    notionUpload = node("failed", lastRun, notionProgress, {
      code: "NOTION_FAILED",
      message: errMsg,
    });
  } else if (st === "success" || st === "partial") {
    notionUpload = node("completed", lastRun, 100);
  } else if (st === "failed" && step !== "upload") {
    notionUpload = node("pending", lastRun, notionProgress);
  } else if (notionCount > 0) {
    notionUpload = node("completed", lastRun, notionProgress);
  } else {
    notionUpload = node("pending", lastRun, 0);
  }

  return { twitterSync, deepReports, notionUpload };
}

// ─────────────────────────────────────────────
// Check if data source is empty
// ─────────────────────────────────────────────

export function isEmpty(): boolean {
  if (!fs.existsSync(OUTPUT_DIR)) return true;
  const files = fs.readdirSync(OUTPUT_DIR).filter((f) => f.endsWith(".md"));
  return files.length === 0;
}
