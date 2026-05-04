/**
 * Filesystem Data Layer — reads from x-bookmark-reports output directories
 * Replaces SQLite/mock data with direct file reading.
 * CONTRACT v2 — article pipeline (output/article-final + pipeline state)
 */

import * as fs from "fs";
import * as path from "path";
import type {
  BatchProgress,
  BatchProgressItem,
  DashboardPipelineFour,
  PipelineNode,
} from "@/types/api";
import { getRepoRoot } from "@/lib/repo-root";

// ─────────────────────────────────────────────
// Paths — repo root (works when cwd is `ui/` or repo root)
// ─────────────────────────────────────────────

const REPO_ROOT = getRepoRoot();
const OUTPUT_DIR = path.join(REPO_ROOT, "output");
const ARTICLE_FINAL_DIR = path.join(OUTPUT_DIR, "article-final");
const PIPELINE_STATE_FILE = path.join(OUTPUT_DIR, ".article-pipeline-state.json");
const NOTION_FINISHED_STATE = path.join(OUTPUT_DIR, ".notion-finished-state.json");

const DEEP_DRAFT_PREFIX = "bookmark-deep-";

/** Article pipeline output dir (replaces Hermes iCloud path). */
export function getArticlesDir(): string {
  return ARTICLE_FINAL_DIR;
}

// ─────────────────────────────────────────────
// Deep draft → tweet id
// ─────────────────────────────────────────────

export function extractTweetIdFromDeepDraftFilename(file: string): string | null {
  // bookmark-deep-{id}-{YYYYMMDD_HHMMSS}.md
  const m = file.match(/^bookmark-deep-(\d+)-/);
  return m ? m[1] : null;
}

export function listDeepDraftTweetIds(): string[] {
  if (!fs.existsSync(OUTPUT_DIR)) return [];
  const ids: string[] = [];
  for (const f of fs.readdirSync(OUTPUT_DIR)) {
    if (!f.startsWith(DEEP_DRAFT_PREFIX) || !f.endsWith(".md")) continue;
    const id = extractTweetIdFromDeepDraftFilename(f);
    if (id) ids.push(id);
  }
  return ids;
}

function findDeepDraftPathByTweetId(tweetId: string): string | null {
  if (!fs.existsSync(OUTPUT_DIR)) return null;
  const match = fs
    .readdirSync(OUTPUT_DIR)
    .find((f) => f.startsWith(`${DEEP_DRAFT_PREFIX}${tweetId}-`) && f.endsWith(".md"));
  return match ? path.join(OUTPUT_DIR, match) : null;
}

// ─────────────────────────────────────────────
// Pipeline state (.article-pipeline-state.json)
// ─────────────────────────────────────────────

export type PipelineArticleEntry = {
  status?: string;
  updated_at?: string;
  last_error?: string;
  metadata?: { title?: string; tweet_id?: string; url?: string; [k: string]: unknown };
  deep_draft?: string;
  final_md?: string;
  [k: string]: unknown;
};

export function readPipelineArticles(): Record<string, PipelineArticleEntry> {
  if (!fs.existsSync(PIPELINE_STATE_FILE)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(PIPELINE_STATE_FILE, "utf-8")) as {
      articles?: Record<string, PipelineArticleEntry>;
    };
    const articles = raw.articles;
    if (!articles || typeof articles !== "object") return {};
    return articles;
  } catch {
    return {};
  }
}

// ─────────────────────────────────────────────
// Title / frontmatter — deep drafts
// ─────────────────────────────────────────────

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

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  if (!raw.startsWith("---")) {
    return { meta: {}, body: raw };
  }
  const end = raw.indexOf("\n---", 3);
  if (end === -1) {
    return { meta: {}, body: raw };
  }
  const header = raw.slice(3, end).trim();
  const body = raw.slice(end + 4).trimStart();
  const meta: Record<string, string> = {};
  for (const line of header.split("\n")) {
    const colon = line.indexOf(":");
    if (colon > -1) {
      meta[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
    }
  }
  return { meta, body };
}

/** Parse article-final frontmatter (quoted strings, JSON tags array). */
export function parseArticlePipelineFrontmatter(raw: string): {
  title: string;
  author?: string;
  sourceUrl?: string;
  tags: string[];
  notionIcon?: string;
  generatedAt?: string;
  body: string;
} {
  const { meta, body } = parseFrontmatter(raw);
  function stripQuotes(v: string): string {
    const t = v.trim();
    if (t.length >= 2 && t[0] === t[t.length - 1] && (t[0] === '"' || t[0] === "'")) {
      return t.slice(1, -1);
    }
    return t;
  }
  let tags: string[] = [];
  const tagsRaw = meta.tags?.trim() ?? "";
  if (tagsRaw.startsWith("[")) {
    try {
      const parsed = JSON.parse(tagsRaw) as unknown;
      if (Array.isArray(parsed)) tags = parsed.map(String);
    } catch {
      /* ignore */
    }
  }
  return {
    title: stripQuotes(meta.title || ""),
    author: meta.author ? stripQuotes(meta.author) : undefined,
    sourceUrl: meta.source_url ? stripQuotes(meta.source_url) : undefined,
    tags,
    notionIcon: meta.notion_icon ? stripQuotes(meta.notion_icon) : undefined,
    generatedAt: meta.generated_at ? stripQuotes(meta.generated_at) : undefined,
    body,
  };
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

export type FsArticlePipelineStatus =
  | "draft"
  | "metadata_done"
  | "researched"
  | "written"
  | "uploaded"
  | "failed";

export interface FsArticle {
  id: string;
  fileName: string;
  title: string;
  content: string;
  wordCount: number;
  publishedAt: string;
  status: FsArticlePipelineStatus;
  tags: string[];
  author?: string;
  sourceUrl?: string;
  notionIcon?: string;
  generatedAt?: string;
  lastError?: string;
  draftPath?: string;
}

function normalizePipelineStatus(st: string | undefined): FsArticlePipelineStatus {
  const s = String(st || "draft");
  if (
    s === "metadata_done" ||
    s === "researched" ||
    s === "written" ||
    s === "uploaded" ||
    s === "failed"
  ) {
    return s;
  }
  return "draft";
}

function countNotionFinishedUploaded(): number {
  if (!fs.existsSync(NOTION_FINISHED_STATE)) return 0;
  try {
    const raw = JSON.parse(fs.readFileSync(NOTION_FINISHED_STATE, "utf-8")) as { uploaded?: unknown };
    if (Array.isArray(raw.uploaded)) return raw.uploaded.length;
  } catch {
    /* ignore */
  }
  return 0;
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
  const files = fs
    .readdirSync(OUTPUT_DIR)
    .filter((f) => f.startsWith(DEEP_DRAFT_PREFIX) && f.endsWith(".md"));
  let drafts: FsBookmark[] = [];
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(OUTPUT_DIR, file), "utf-8");
      const { meta, body } = parseFrontmatter(content);
      let draftBody = body || (meta.body as string) || "";
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
// Articles — all deep drafts + pipeline / article-final
// ─────────────────────────────────────────────

function buildFsArticleForTweetId(tweetId: string): FsArticle | null {
  const pipeline = readPipelineArticles();
  const entry = pipeline[tweetId];
  const st = normalizePipelineStatus(entry?.status as string | undefined);

  const finalPath = path.join(ARTICLE_FINAL_DIR, `${tweetId}.md`);
  let content = "";
  let title = entry?.metadata?.title || "";
  let publishedAt = typeof entry?.updated_at === "string" ? entry.updated_at : new Date().toISOString();
  let tags: string[] = [];
  let author: string | undefined;
  let sourceUrl: string | undefined;
  let notionIcon: string | undefined;
  let generatedAt: string | undefined;
  let wordCount = 0;

  if (fs.existsSync(finalPath)) {
    try {
      const raw = fs.readFileSync(finalPath, "utf-8");
      const fm = parseArticlePipelineFrontmatter(raw);
      content = fm.body;
      if (fm.title) title = fm.title;
      tags = fm.tags;
      author = fm.author;
      sourceUrl = fm.sourceUrl;
      notionIcon = fm.notionIcon;
      generatedAt = fm.generatedAt;
      wordCount = raw.split(/\s+/).filter(Boolean).length;
      const stStat = fs.statSync(finalPath);
      publishedAt = new Date(stStat.mtimeMs).toISOString();
    } catch {
      /* ignore */
    }
  }

  const draftPath = findDeepDraftPathByTweetId(tweetId);
  if (!draftPath && !entry) return null;

  if (!title && draftPath) {
    try {
      const raw = fs.readFileSync(draftPath, "utf-8");
      const { body } = parseFrontmatter(raw);
      title = extractTitle(body || "", path.basename(draftPath));
      if (!sourceUrl) sourceUrl = getTweetUrlFromBody(body) || undefined;
      if (!content && body) content = body.slice(0, 500) + (body.length > 500 ? "\n\n…" : "");
      wordCount = wordCount || raw.split(/\s+/).filter(Boolean).length;
    } catch {
      title = title || tweetId;
    }
  }

  title = title || tweetId;
  const lastError = typeof entry?.last_error === "string" ? entry.last_error : undefined;

  let statusOut: FsArticlePipelineStatus = st;
  if ((st === "written" || st === "uploaded") && fs.existsSync(finalPath)) {
    statusOut = st;
  } else if (st === "written" && !fs.existsSync(finalPath)) {
    statusOut = "researched";
  }

  return {
    id: tweetId,
    fileName: `${tweetId}.md`,
    title,
    content,
    wordCount,
    publishedAt,
    status: statusOut,
    tags,
    author,
    sourceUrl: sourceUrl || (typeof entry?.metadata?.url === "string" ? entry.metadata.url : undefined),
    notionIcon,
    generatedAt,
    lastError,
    draftPath: draftPath || undefined,
  };
}

export function listArticles(
  page: number = 1,
  limit: number = 20,
  status?: string,
  search?: string
): { items: FsArticle[]; total: number; hasMore: boolean } {
  const tweetIds = new Set(listDeepDraftTweetIds());
  const pipeline = readPipelineArticles();
  for (const k of Object.keys(pipeline)) {
    tweetIds.add(k);
  }

  const idList = Array.from(tweetIds);
  let articles: FsArticle[] = [];
  for (const tid of idList) {
    const a = buildFsArticleForTweetId(tid);
    if (a) articles.push(a);
  }

  if (status) {
    articles = articles.filter((a) => a.status === status);
  }
  if (search) {
    const s = search.toLowerCase();
    articles = articles.filter(
      (a) =>
        a.title.toLowerCase().includes(s) ||
        a.content.toLowerCase().includes(s) ||
        a.author?.toLowerCase().includes(s) ||
        a.tags.some((t) => t.toLowerCase().includes(s))
    );
  }
  articles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  const total = articles.length;
  const offset = (page - 1) * limit;
  const items = articles.slice(offset, offset + limit);
  return { items, total, hasMore: page * limit < total };
}

export function getArticleById(id: string): FsArticle | null {
  return buildFsArticleForTweetId(id);
}

/** Absolute path to `output/article-final/{tweetId}.md` when the file exists. */
export function getArticleFinalFilePath(tweetId: string): string | null {
  const finalPath = path.join(ARTICLE_FINAL_DIR, `${tweetId}.md`);
  return fs.existsSync(finalPath) ? finalPath : null;
}

/** Save edited markdown body (keeps frontmatter if present). */
export function saveArticleFinalMarkdown(tweetId: string, newBody: string): boolean {
  const finalPath = path.join(ARTICLE_FINAL_DIR, `${tweetId}.md`);
  if (!fs.existsSync(finalPath)) return false;
  try {
    const raw = fs.readFileSync(finalPath, "utf-8");
    if (!raw.startsWith("---")) {
      fs.writeFileSync(finalPath, newBody, "utf-8");
      return true;
    }
    const end = raw.indexOf("\n---", 3);
    if (end === -1) {
      fs.writeFileSync(finalPath, newBody, "utf-8");
      return true;
    }
    const fmBlock = raw.slice(0, end + 4);
    fs.writeFileSync(finalPath, `${fmBlock}\n${newBody.trimStart()}\n`, "utf-8");
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────
// Dashboard — file-backed stats
// ─────────────────────────────────────────────

export interface FsDashboardStats {
  totalDrafts: number;
  totalArticles: number;
  notionTotalUploaded: number;
  notionFinishedUploaded: number;
  pendingRewrite: number;
  newThisWeek: number;
  lastSync: string | null;
}

function countDeepDrafts(): { total: number; newThisWeek: number } {
  let total = 0;
  let newThisWeek = 0;
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - weekMs;

  function scanDir(dir: string): void {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir)) {
      if (!f.startsWith(DEEP_DRAFT_PREFIX) || !f.endsWith(".md")) continue;
      total++;
      try {
        const st = fs.statSync(path.join(dir, f));
        if (st.mtimeMs >= cutoff) newThisWeek++;
      } catch {
        /* ignore */
      }
    }
  }

  scanDir(OUTPUT_DIR);
  return { total, newThisWeek };
}

function countArticleFinals(): number {
  if (!fs.existsSync(ARTICLE_FINAL_DIR)) return 0;
  return fs.readdirSync(ARTICLE_FINAL_DIR).filter((f) => f.endsWith(".md")).length;
}

export function getDashboardStats(): FsDashboardStats {
  const { total: totalDrafts, newThisWeek } = countDeepDrafts();
  const totalArticles = countArticleFinals();
  const notionFinishedUploaded = countNotionFinishedUploaded();
  const auto = readAutoRunState();
  const lastSync = typeof auto.last_run === "string" ? auto.last_run : null;
  const pendingRewrite = Math.max(0, totalDrafts - totalArticles);

  return {
    totalDrafts,
    totalArticles,
    notionTotalUploaded: 0,
    notionFinishedUploaded,
    pendingRewrite,
    newThisWeek,
    lastSync,
  };
}

type PipelineStepStatus = "pending" | "running" | "completed" | "failed";

function node(
  status: PipelineStepStatus,
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

function pipelineStageCounts(): {
  metadataDone: number;
  researched: number;
  written: number;
  uploaded: number;
} {
  const articles = readPipelineArticles();
  let metadataDone = 0;
  let researched = 0;
  let written = 0;
  let uploaded = 0;
  for (const e of Object.values(articles)) {
    const s = String(e.status || "draft");
    if (s === "metadata_done" || s === "researched" || s === "written" || s === "uploaded") {
      metadataDone++;
    }
    if (s === "researched" || s === "written" || s === "uploaded") researched++;
    if (s === "written" || s === "uploaded") written++;
    if (s === "uploaded") uploaded++;
  }
  return { metadataDone, researched, written, uploaded };
}

function pct(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((done / total) * 100));
}

/** Four-node pipeline: Twitter → Deep → Rewrite → Notion */
export function getPipelineStatus(): DashboardPipelineFour {
  const { total: totalDrafts } = countDeepDrafts();
  const auto = readAutoRunState();
  const deep = readDeepRunState();
  const notionFinishedCount = countNotionFinishedUploaded();

  const st = String(auto.status ?? "");
  const step = String(auto.step ?? "");
  const lastRun = typeof auto.last_run === "string" ? auto.last_run : undefined;
  const errMsg = typeof auto.error === "string" && auto.error ? auto.error : "Pipeline error";

  const deepDone = deep.completed_ids.length;
  const deepProgress =
    totalDrafts > 0
      ? Math.min(100, Math.round((deepDone / totalDrafts) * 100))
      : deepDone > 0
        ? 100
        : 0;

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

  const denom = Math.max(totalDrafts, 1);
  const sc = pipelineStageCounts();
  const rewP = pct(sc.written, denom);

  const bp = getBatchProgress();
  const articleSubRunning = bp.isRunning;

  const rewrite: PipelineNode = articleSubRunning
    ? node("running", bp.items[0]?.updatedAt, rewP)
    : rewP >= 100
      ? node("completed", lastRun, 100)
      : rewP > 0
        ? node("running", lastRun, rewP)
        : node("pending", lastRun, 0);

  const finishedRatio = totalDrafts > 0 ? notionFinishedCount / totalDrafts : 0;
  const notionProgress = Math.min(100, Math.round(finishedRatio * 100));

  let notionUpload: PipelineNode;
  if (st === "running" && step === "upload") {
    notionUpload = node("running", lastRun, notionProgress);
  } else if (st === "failed" && step === "upload") {
    notionUpload = node("failed", lastRun, notionProgress, {
      code: "NOTION_FAILED",
      message: errMsg,
    });
  } else if (st === "success" || st === "partial") {
    notionUpload = node("completed", lastRun, notionProgress >= 100 ? 100 : notionProgress);
  } else if (st === "failed" && step !== "upload") {
    notionUpload = node("pending", lastRun, notionProgress);
  } else if (notionFinishedCount > 0) {
    notionUpload = node("completed", lastRun, Math.min(100, notionProgress));
  } else {
    notionUpload = node("pending", lastRun, 0);
  }

  return {
    twitterSync,
    deepReports,
    rewrite,
    notionUpload,
  };
}

export function getBatchProgress(): BatchProgress {
  const allIds = listDeepDraftTweetIds();
  const totalDraftCount = allIds.length;
  const articles = readPipelineArticles();

  let completed = 0;
  let failed = 0;
  let pending = 0;
  let researching = 0;

  const items: BatchProgressItem[] = [];

  for (const tweetId of allIds) {
    const e = articles[tweetId];
    const st = String(e?.status || "draft");
    if (st === "written" || st === "uploaded") completed++;
    else if (st === "failed") failed++;
    else if (st === "researched") researching++;
    else pending++;

    const title =
      typeof e?.metadata === "object" && e.metadata && "title" in e.metadata
        ? String((e.metadata as { title?: string }).title || "")
        : undefined;
    const draftPath = findDeepDraftPathByTweetId(tweetId);
    let updatedAt = String(e?.updated_at || "");
    if (!updatedAt && draftPath) {
      try {
        updatedAt = new Date(fs.statSync(draftPath).mtimeMs).toISOString();
      } catch {
        updatedAt = "";
      }
    }

    items.push({
      tweetId,
      title: title || undefined,
      status: st,
      updatedAt,
      error: typeof e?.last_error === "string" ? e.last_error : undefined,
    });
  }

  for (const [tweetId, e] of Object.entries(articles)) {
    if (allIds.includes(tweetId)) continue;
    const st = String(e.status || "draft");
    if (st === "written" || st === "uploaded") completed++;
    else if (st === "failed") failed++;
    else if (st === "researched") researching++;
    else pending++;

    const title =
      typeof e.metadata === "object" && e.metadata && "title" in e.metadata
        ? String((e.metadata as { title?: string }).title || "")
        : undefined;
    items.push({
      tweetId,
      title: title || undefined,
      status: st,
      updatedAt: String(e.updated_at || ""),
      error: typeof e.last_error === "string" ? e.last_error : undefined,
    });
  }

  items.sort(
    (a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
  );

  const latest = items[0];
  const RUN_WINDOW_MS = 120000;
  let isRunning = false;
  let currentTweetId: string | undefined;
  let currentStep: "metadata" | "research" | "rewrite" | undefined;

  if (latest?.updatedAt) {
    const age = Date.now() - new Date(latest.updatedAt).getTime();
    const st = latest.status;
    if (
      age < RUN_WINDOW_MS &&
      st !== "written" &&
      st !== "uploaded" &&
      st !== "failed"
    ) {
      isRunning = true;
      currentTweetId = latest.tweetId;
      if (st === "draft") currentStep = "metadata";
      else if (st === "metadata_done") currentStep = "research";
      else if (st === "researched") currentStep = "rewrite";
    }
  }

  const totalInBatch = Math.max(totalDraftCount, items.length, 1);
  const avgMsPerArticle = 180000;
  const remaining = Math.max(0, totalInBatch - completed - failed);
  const estimatedEnd =
    isRunning && remaining > 0
      ? new Date(Date.now() + remaining * avgMsPerArticle).toISOString()
      : undefined;

  return {
    isRunning,
    currentTweetId,
    currentStep,
    totalInBatch,
    completed,
    failed,
    pending,
    researching,
    startedAt: latest?.updatedAt,
    estimatedEnd,
    items: items.slice(0, 100),
  };
}

// ─────────────────────────────────────────────
// Check if data source is empty
// ─────────────────────────────────────────────

export function isEmpty(): boolean {
  if (!fs.existsSync(OUTPUT_DIR)) return true;
  return !fs.readdirSync(OUTPUT_DIR).some((f) => f.startsWith(DEEP_DRAFT_PREFIX) && f.endsWith(".md"));
}
