/**
 * Filesystem Data Layer — reads from x-bookmark-reports output directories
 * Replaces SQLite/mock data with direct file reading.
 * CONTRACT v2 — article pipeline (output/article-final + pipeline state)
 */

import * as fs from "fs";
import * as path from "path";
import type {
  ActivityItem,
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
// Stage 4：coordinator 跑批状态文件（spawn 时写 last_run_started，exit 时写 last_run_finished）
const DEEP_RUN_STATE_FILE = path.join(OUTPUT_DIR, ".deep-run-state.json");
// Stage 4：auto_run.sh 全流程状态文件（已有 last_run/status/step 字段）
const AUTO_RUN_STATE_FILE = path.join(OUTPUT_DIR, "auto_run_state.json");

const DEEP_DRAFT_PREFIX = "bookmark-deep-";

// twitter_data/bookmarks.json — 数据真相源（1584 条）
const BOOKMARKS_JSON = path.join(REPO_ROOT, "..", "twitter_data", "bookmarks.json");

// deep draft 中需要被 extractTitle 跳过的 section header（H2）
const DEEP_DRAFT_SECTION_HEADERS = new Set([
  "主推文",
  "媒体",
  "回复",
  "回复线程",
  "外部链接",
  "深度报告",
  "成品文章",
]);

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
 * Draft bookmark title: **bold** line → `#` H1 → `##` H2 (跳过 section headers) → first non-empty (80 chars) → basename.
 */
export function extractTitle(body: string, filename: string): string {
  const lines = body.split("\n");
  // 1) **bold** line (保持现状)
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
  // 2) # H1 (保持现状)
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^#\s+/.test(trimmed) && !/^##/.test(trimmed)) {
      return trimmed.replace(/^#\s+/, "").trim();
    }
  }
  // 3) ## H2 — 跳过 section headers (新增过滤)
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^##\s+/.test(trimmed)) {
      const title = trimmed.replace(/^##\s+/, "").trim();
      if (DEEP_DRAFT_SECTION_HEADERS.has(title)) continue;
      return title;
    }
  }
  // 4) first non-empty line, 但跳过 section headers (新增过滤)
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (DEEP_DRAFT_SECTION_HEADERS.has(trimmed.replace(/^##?\s+/, ""))) continue;
    return trimmed.slice(0, 80);
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
  | "failed"
  | "skipped";

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
    s === "failed" ||
    s === "skipped"
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

// notionSet 可选参：listArticles 在循环外读一次共享，避免 642 次重复 IO；
// 外部 getArticleById 不传时回落到 getNotionFinishedSet() 默认实现
function buildFsArticleForTweetId(
  tweetId: string,
  notionSet?: Set<string>,
): FsArticle | null {
  const _notionSet = notionSet ?? getNotionFinishedSet();
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

  // Stage 4：fs 数据层没有 pipeline 写入 uploaded，靠 notion-finished-state 升级
  // B-ARTC-UPLOADED-NEVER-WRITTEN：pipeline state 永远停在 "written"，但 Notion 已上传
  if (statusOut === "written" && _notionSet.has(tweetId)) {
    statusOut = "uploaded";
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
): {
  items: FsArticle[];
  total: number;
  hasMore: boolean;
  stats: { drafts: number; finished: number; failed: number };
} {
  const tweetIds = new Set(listDeepDraftTweetIds());
  const pipeline = readPipelineArticles();
  for (const k of Object.keys(pipeline)) {
    tweetIds.add(k);
  }

  const idList = Array.from(tweetIds);
  // Stage 4：循环外读一次 notion finished set，共享给 buildFsArticleForTweetId，
  // 避免 642 次重复读文件 + JSON parse + filter 的 perf hit
  const notionSet = getNotionFinishedSet();
  let articles: FsArticle[] = [];
  for (const tid of idList) {
    const a = buildFsArticleForTweetId(tid, notionSet);
    if (a) articles.push(a);
  }

  // 页头口径：在 status/search 过滤前统计全局 drafts / finished / failed
  const drafts = articles.length;
  let finished = 0;
  let failed = 0;
  for (const a of articles) {
    if (a.status === "written" || a.status === "uploaded") finished++;
    else if (a.status === "failed") failed++;
  }
  const stats = { drafts, finished, failed };

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
  return { items, total, hasMore: page * limit < total, stats };
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

type PipelineStepStatus = "pending" | "running" | "completed" | "failed" | "partial";

function node(
  status: PipelineStepStatus,
  lastRun?: string,
  progress?: number,
  err?: { code: string; message: string },
  progressGlobal?: number,
): PipelineNode {
  const n: PipelineNode = { status };
  if (lastRun) n.lastRun = lastRun;
  if (progress !== undefined) n.progress = progress;
  if (progressGlobal !== undefined) n.progressGlobal = progressGlobal;
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
  } else if (deepDone > 0 && Array.isArray(deep.errors) && deep.errors.length > 0) {
    // Idle 且有错误：partial（勿再误标 running）
    deepReports = node("partial", deep.last_run || lastRun, deepProgress);
  } else if (deepDone > 0) {
    // Idle 有进度无错误：pending（等待下次 deep-batch）
    deepReports = node("pending", deep.last_run || lastRun, deepProgress);
  } else if (twitterSync.status === "completed") {
    deepReports = node("pending", deep.last_run || undefined, 0);
  } else {
    deepReports = node("pending");
  }

  const denom = Math.max(totalDrafts, 1);
  const sc = pipelineStageCounts();
  const rewP = pct(sc.written, denom);

  // Stage 2: 全局进度（denom 改为 1584 总书签数）
  const totalBookmarks = countTotalBookmarks();
  const denomGlobal = Math.max(totalBookmarks, 1);
  const rewPGlobal = pct(sc.written, denomGlobal);

  const bp = getBatchProgress();
  const articleSubRunning = bp.isRunning;

  // Rewrite 状态机：Idle + failed 时标 partial/failed，不再把进度中的管线误标为 running
  let rewrite: PipelineNode;
  if (articleSubRunning) {
    rewrite = node("running", bp.items[0]?.updatedAt, rewP, undefined, rewPGlobal);
  } else if (rewP >= 100 && bp.failed === 0) {
    rewrite = node("completed", lastRun, 100, undefined, rewPGlobal);
  } else if (bp.failed > 0 && bp.completed > 0) {
    rewrite = node("partial", lastRun, rewP, undefined, rewPGlobal);
  } else if (bp.failed > 0) {
    // 整批失败、零完成
    rewrite = node("failed", lastRun, rewP, undefined, rewPGlobal);
  } else if (rewP > 0) {
    // 有进度但尚无 failed，且未在跑：视为 pending（等待下次 batch）
    rewrite = node("pending", lastRun, rewP, undefined, rewPGlobal);
  } else {
    rewrite = node("pending", lastRun, 0, undefined, rewPGlobal);
  }

  const finishedRatio = totalDrafts > 0 ? notionFinishedCount / totalDrafts : 0;
  const notionProgress = Math.min(100, Math.round(finishedRatio * 100));
  // Stage 2: Notion 上传全局进度（相对 1584 总书签数）
  const notionProgressGlobal = pct(notionFinishedCount, denomGlobal);

  let notionUpload: PipelineNode;
  if (st === "running" && step === "upload") {
    notionUpload = node("running", lastRun, notionProgress, undefined, notionProgressGlobal);
  } else if (st === "failed" && step === "upload") {
    notionUpload = node("failed", lastRun, notionProgress, {
      code: "NOTION_FAILED",
      message: errMsg,
    }, notionProgressGlobal);
  } else if (st === "success" || st === "partial") {
    notionUpload = node(
      "completed",
      lastRun,
      notionProgress >= 100 ? 100 : notionProgress,
      undefined,
      notionProgressGlobal,
    );
  } else if (st === "failed" && step !== "upload") {
    notionUpload = node("pending", lastRun, notionProgress, undefined, notionProgressGlobal);
  } else if (notionFinishedCount > 0) {
    notionUpload = node("completed", lastRun, Math.min(100, notionProgress), undefined, notionProgressGlobal);
  } else {
    notionUpload = node("pending", lastRun, 0, undefined, notionProgressGlobal);
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
// Raw bookmarks (twitter_data/bookmarks.json)
// ─────────────────────────────────────────────

// 单条 bookmark 原始结构（仅标注本任务用到的字段，其余按 unknown 透传）
export interface RawBookmark {
  id: string;
  createdAt: string;
  fullText?: string;
  lang?: string;
  tweetBy?: {
    userName?: string;
    fullName?: string;
    profileImage?: string;
    [k: string]: unknown;
  };
  likeCount?: number;
  retweetCount?: number;
  replyCount?: number;
  quoteCount?: number;
  viewCount?: number;
  bookmarkCount?: number;
  url?: string;
  media?: unknown[];
  entities?: { urls?: unknown[]; [k: string]: unknown };
  [k: string]: unknown;
}

// bookmarks.json 内存缓存（按 mtime 失效，避免每次 list 都重读 3.8MB）
let _rawBookmarksCache: { mtime: number; data: RawBookmark[] } | null = null;

// 加载 bookmarks.json；文件不存在 / 解析失败 / 非 array 时返回 []
export function loadRawBookmarks(): RawBookmark[] {
  if (!fs.existsSync(BOOKMARKS_JSON)) return [];
  try {
    const st = fs.statSync(BOOKMARKS_JSON);
    if (_rawBookmarksCache && _rawBookmarksCache.mtime === st.mtimeMs) {
      return _rawBookmarksCache.data;
    }
    const raw = fs.readFileSync(BOOKMARKS_JSON, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const data = parsed as RawBookmark[];
    _rawBookmarksCache = { mtime: st.mtimeMs, data };
    return data;
  } catch {
    return [];
  }
}

// 总书签数（= bookmarks.json 长度，期望 1584）
export function countTotalBookmarks(): number {
  return loadRawBookmarks().length;
}

// ─────────────────────────────────────────────
// Lifecycle joining sets (deep drafts / articles / notion)
// ─────────────────────────────────────────────

// 已生成 deep draft 的 tweet id 集合
export function getDeepDraftSet(): Set<string> {
  return new Set(listDeepDraftTweetIds());
}

// 已写成品文章的 tweet id 集合（output/article-final/*.md，文件名纯数字）
export function getArticleWrittenSet(): Set<string> {
  if (!fs.existsSync(ARTICLE_FINAL_DIR)) return new Set();
  const set = new Set<string>();
  try {
    for (const f of fs.readdirSync(ARTICLE_FINAL_DIR)) {
      if (!f.endsWith(".md")) continue;
      const id = f.replace(/\.md$/, "");
      if (/^\d+$/.test(id)) set.add(id);
    }
  } catch {
    /* ignore */
  }
  return set;
}

// 已上传 Notion 的 tweet id 集合（output/.notion-finished-state.json uploaded 数组）
// 实际数据格式为 ["{tweetId}.md", ...]，需先 strip `.md` 后缀再过滤纯数字
export function getNotionFinishedSet(): Set<string> {
  if (!fs.existsSync(NOTION_FINISHED_STATE)) return new Set();
  try {
    const raw = JSON.parse(fs.readFileSync(NOTION_FINISHED_STATE, "utf-8")) as { uploaded?: unknown };
    if (!Array.isArray(raw.uploaded)) return new Set();
    return new Set(
      raw.uploaded
        .map((x) => String(x).replace(/\.md$/i, ""))
        .filter((x) => /^\d+$/.test(x))
    );
  } catch {
    return new Set();
  }
}

// ─────────────────────────────────────────────
// FsBookmarkV2 — bookmarks.json as source of truth
// ─────────────────────────────────────────────

// 生命周期：pending（仅 sync）→ drafted（有 deep）→ written（有 article）→ uploaded（在 Notion）
export type FsBookmarkLifecycle = "pending" | "drafted" | "written" | "uploaded";

// V2 bookmark 视图（基于 bookmarks.json 为真相源）
export interface FsBookmarkV2 {
  id: string;            // tweet id（与 tweetId 同值）
  tweetId: string;
  url: string;
  author: { name: string; handle: string; avatar?: string };
  text: string;          // 截断预览（fullText 前 160 字符）
  fullText: string;
  bookmarkedAt: string;  // = raw.createdAt（保留原字符串，不解析为 Date）
  stats: { likes: number; retweets: number; replies: number; quotes: number; views: number; bookmarks: number };
  tags: string[];        // 来自 article-final frontmatter（无文章则为空）
  lifecycle: FsBookmarkLifecycle;
  hasDeepDraft: boolean;
  hasArticle: boolean;
  inNotion: boolean;
}

// raw → FsBookmarkV2 转换（合并 lifecycle 三集合 + tags map）
function rawToFsBookmarkV2(
  raw: RawBookmark,
  deepSet: Set<string>,
  articleSet: Set<string>,
  notionSet: Set<string>,
  articleTagsMap: Map<string, string[]>,
): FsBookmarkV2 {
  const tid = String(raw.id || "");
  const fullText = String(raw.fullText || "");
  const tb = raw.tweetBy || {};
  const handle = String(tb.userName || "unknown");
  const inNotion = notionSet.has(tid);
  const hasArticle = articleSet.has(tid);
  const hasDeepDraft = deepSet.has(tid);
  // 生命周期优先级：uploaded > written > drafted > pending
  let lifecycle: FsBookmarkLifecycle;
  if (inNotion) lifecycle = "uploaded";
  else if (hasArticle) lifecycle = "written";
  else if (hasDeepDraft) lifecycle = "drafted";
  else lifecycle = "pending";

  return {
    id: tid,
    tweetId: tid,
    url: String(raw.url || `https://x.com/${handle}/status/${tid}`),
    author: {
      name: String(tb.fullName || tb.userName || "Unknown"),
      handle: handle.startsWith("@") ? handle.slice(1) : handle,
      avatar: tb.profileImage ? String(tb.profileImage) : undefined,
    },
    text: fullText.slice(0, 160),
    fullText,
    bookmarkedAt: String(raw.createdAt || ""),
    stats: {
      likes: Number(raw.likeCount || 0),
      retweets: Number(raw.retweetCount || 0),
      replies: Number(raw.replyCount || 0),
      quotes: Number(raw.quoteCount || 0),
      views: Number(raw.viewCount || 0),
      bookmarks: Number(raw.bookmarkCount || 0),
    },
    tags: articleTagsMap.get(tid) || [],
    lifecycle,
    hasDeepDraft,
    hasArticle,
    inNotion,
  };
}

// 为已写文章的 tweet 构造 tags 映射（读 article-final frontmatter）
function buildArticleTagsMap(articleSet: Set<string>): Map<string, string[]> {
  const map = new Map<string, string[]>();
  // 用 Array.from 规避 tsconfig target < es2015 下 `for...of` Set 报错
  for (const tid of Array.from(articleSet)) {
    const p = path.join(ARTICLE_FINAL_DIR, `${tid}.md`);
    try {
      const raw = fs.readFileSync(p, "utf-8");
      const fm = parseArticlePipelineFrontmatter(raw);
      if (fm.tags && fm.tags.length > 0) map.set(tid, fm.tags);
    } catch {
      /* ignore */
    }
  }
  return map;
}

// 列出所有 bookmarks（分页 + 搜索 + lifecycle 过滤），保持 bookmarks.json 原顺序（前=新）
export function listAllBookmarks(
  page: number = 1,
  limit: number = 20,
  search?: string,
  lifecycle?: FsBookmarkLifecycle,
): { items: FsBookmarkV2[]; total: number; hasMore: boolean } {
  const raws = loadRawBookmarks();
  const deepSet = getDeepDraftSet();
  const articleSet = getArticleWrittenSet();
  const notionSet = getNotionFinishedSet();
  const tagsMap = buildArticleTagsMap(articleSet);

  let items = raws.map((r) => rawToFsBookmarkV2(r, deepSet, articleSet, notionSet, tagsMap));

  if (lifecycle) {
    items = items.filter((b) => b.lifecycle === lifecycle);
  }
  if (search) {
    const s = search.toLowerCase();
    items = items.filter(
      (b) =>
        b.author.name.toLowerCase().includes(s) ||
        b.author.handle.toLowerCase().includes(s) ||
        b.fullText.toLowerCase().includes(s) ||
        b.tags.some((t) => t.toLowerCase().includes(s)),
    );
  }

  // 不重排：bookmarks.json 前面=新，保持原顺序稳定
  const total = items.length;
  const offset = (page - 1) * limit;
  const sliced = items.slice(offset, offset + limit);
  return { items: sliced, total, hasMore: page * limit < total };
}

// 详情视图：在 V2 基础上补充 deepDraftPath / articlePath / notionPageUrl / deepDraftBody
export interface FsBookmarkV2Detail extends FsBookmarkV2 {
  deepDraftPath?: string;
  articlePath?: string;
  notionPageUrl?: string;       // 留空，Notion page URL 留 PR-3 处理；本 Stage 仅占位
  deepDraftBody?: string;       // 完整 deep draft markdown body（含 frontmatter 后的内容）
}

// 按 tweet id 取单条 bookmark 详情；兼容旧 basename id（bookmark-deep-{tweetId}-{ts}）
export function getBookmarkByTweetId(id: string): FsBookmarkV2Detail | null {
  // 兼容旧 basename id：bookmark-deep-{tweetId}-{ts}
  let tweetId = id;
  const m = id.match(/bookmark-deep-(\d+)/);
  if (m) tweetId = m[1];
  // 仅接受 19 位左右纯数字
  if (!/^\d+$/.test(tweetId)) return null;

  const raws = loadRawBookmarks();
  const raw = raws.find((r) => String(r.id) === tweetId);
  if (!raw) return null;

  const deepSet = getDeepDraftSet();
  const articleSet = getArticleWrittenSet();
  const notionSet = getNotionFinishedSet();
  const tagsMap = buildArticleTagsMap(articleSet);
  const base = rawToFsBookmarkV2(raw, deepSet, articleSet, notionSet, tagsMap);

  const draftPath = findDeepDraftPathByTweetId(tweetId);
  const articlePath = articleSet.has(tweetId)
    ? path.join(ARTICLE_FINAL_DIR, `${tweetId}.md`)
    : undefined;

  let deepDraftBody: string | undefined;
  if (draftPath) {
    try {
      const raw2 = fs.readFileSync(draftPath, "utf-8");
      const { body } = parseFrontmatter(raw2);
      deepDraftBody = body;
    } catch {
      /* ignore */
    }
  }

  return {
    ...base,
    deepDraftPath: draftPath || undefined,
    articlePath,
    notionPageUrl: undefined,
    deepDraftBody,
  };
}

// extractDeepDraftTitle — extractTitle 的语义别名（用于 deep draft title 提取）
export function extractDeepDraftTitle(body: string, filename: string): string {
  return extractTitle(body, filename);
}

// ─────────────────────────────────────────────
// Stage 4：Pipeline state 文件写入 + Activities fs 派生
// ─────────────────────────────────────────────

// 三个 pipeline route 共享的 state 文件 last_run_* 字段集合
export interface RunStateFields {
  last_run_started?: string;
  last_run_finished?: string;
  last_run_status?: "success" | "failed" | "running";
  last_run_error?: string;
  last_run_step?: string;
}

/**
 * Stage 4：pipeline route spawn / exit / error 时更新 state 文件的 last_run_* 字段。
 * 保留原文件其他字段（completed_ids / articles / uploaded 等）不变，仅合并 last_run_*。
 *
 * 用途：解决 B-SYNC-DEEP-TIMESTAMP-MISLEADING（coordinator 跑完不更新 last_run）。
 *
 * 设计要点：
 *   - 文件不存在时创建默认结构 + 写入 last_run_* 字段
 *   - 文件存在但解析失败时，**不破坏原内容**，仅追加 last_run_* 字段
 *   - 用 try/catch 包裹，避免 Next.js 进程因 state 文件 IO 异常崩溃
 */
export function updateRunState(stateFilePath: string, updates: RunStateFields): void {
  try {
    let current: Record<string, unknown> = {};
    if (fs.existsSync(stateFilePath)) {
      try {
        const raw = fs.readFileSync(stateFilePath, "utf-8");
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          current = parsed as Record<string, unknown>;
        } else {
          // 非 object：禁止覆写，避免清空 articles / completed_ids
          console.error(`[updateRunState] refuse write: non-object JSON at ${stateFilePath}`);
          return;
        }
      } catch (err) {
        // 解析失败：禁止覆写损坏文件
        console.error(
          `[updateRunState] refuse write: JSON parse failed at ${stateFilePath}`,
          err
        );
        return;
      }
    }
    const merged: Record<string, unknown> = { ...current };
    if (updates.last_run_started !== undefined) {
      merged.last_run_started = updates.last_run_started;
    }
    if (updates.last_run_finished !== undefined) {
      merged.last_run_finished = updates.last_run_finished;
    }
    if (updates.last_run_status !== undefined) {
      merged.last_run_status = updates.last_run_status;
    }
    if (updates.last_run_error !== undefined) {
      merged.last_run_error = updates.last_run_error;
    }
    if (updates.last_run_step !== undefined) {
      merged.last_run_step = updates.last_run_step;
    }
    // 原子写：同目录 tmp + rename（与 Python os.replace 一致）
    const tmpPath = `${stateFilePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(merged, null, 2), "utf-8");
    fs.renameSync(tmpPath, stateFilePath);
  } catch {
    // 全部异常吞掉：state 文件写入失败不应阻塞 pipeline spawn / API 响应
  }
}

// 4 个 state 文件 → ActivityItem.type 映射
const STATE_FILE_TO_TYPE = {
  [DEEP_RUN_STATE_FILE]: "coordinator",
  [PIPELINE_STATE_FILE]: "article_pipeline",
  [NOTION_FINISHED_STATE]: "notion_upload",
  [AUTO_RUN_STATE_FILE]: "auto_run",
} as const;

// 每个 type 对应的人类可读标题
const ACTIVITY_TITLE: Record<string, string> = {
  coordinator: "Coordinator deep-batch run",
  article_pipeline: "Article pipeline run",
  notion_upload: "Notion upload run",
  auto_run: "Auto pipeline run",
};

// 从 state 文件 record 中提取 last_run_finished / last_run / status / step / error
function extractRunStateFields(
  raw: Record<string, unknown>,
): {
  timestamp: string | null;
  status: string | null;
  step: string | null;
  error: string | null;
} {
  // 优先用 last_run_finished（Stage 4 新增字段）；fallback 顺序：
  //   .deep-run-state.json 有 last_run（旧字段）
  //   auto_run_state.json 有 last_run
  const finished = typeof raw.last_run_finished === "string" ? raw.last_run_finished : null;
  const lastRun = typeof raw.last_run === "string" ? raw.last_run : null;
  const started = typeof raw.last_run_started === "string" ? raw.last_run_started : null;
  // 时间戳选取优先级：finished > last_run > started
  const timestamp = finished || lastRun || started;

  // status 字段名可能为 last_run_status（新）或 status（auto_run 旧字段）
  const status =
    typeof raw.last_run_status === "string"
      ? raw.last_run_status
      : typeof raw.status === "string"
        ? raw.status
        : null;

  const step =
    typeof raw.last_run_step === "string"
      ? raw.last_run_step
      : typeof raw.step === "string"
        ? raw.step
        : null;

  const error =
    typeof raw.last_run_error === "string"
      ? raw.last_run_error
      : typeof raw.error === "string"
        ? raw.error
        : null;

  return { timestamp, status, step, error };
}

// 将 status 字符串映射为 ActivityAction（DB 真值 schema 仍用 action 字段）
function statusToAction(status: string | null): "started" | "completed" | "failed" | "updated" {
  if (!status) return "updated";
  const s = status.toLowerCase();
  if (s === "success" || s === "completed" || s === "done") return "completed";
  if (s === "failed" || s === "error") return "failed";
  if (s === "running") return "started";
  return "updated";
}

/**
 * Stage 4：fs 模式下从 4 个 state 文件派生 Activity 列表，解决 B-ACT-001。
 *
 * 每个 state 文件提取 last_run_finished（或 fallback last_run / last_run_started）
 * + last_run_status + step，合并成 ActivityItem[]，按 timestamp 倒序排序，取前 limit 条。
 *
 * 找不到字段时跳过该文件，不抛错。
 */
export function listFsActivities(limit: number = 20): { items: ActivityItem[]; total: number } {
  const items: ActivityItem[] = [];

  for (const [filePath, type] of Object.entries(STATE_FILE_TO_TYPE)) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const record = raw as Record<string, unknown>;
      const extracted = extractRunStateFields(record);
      if (!extracted.timestamp) continue;

      const action = statusToAction(extracted.status);
      const title = ACTIVITY_TITLE[type] || String(type);

      // 错误信息拼到 message 里方便 UI 直接展示
      const message = extracted.error
        ? `${title} — ${action} (${extracted.error.slice(0, 80)})`
        : `${title} — ${action}`;

      items.push({
        id: `fs_${type}_${extracted.timestamp}`,
        type: type as ActivityItem["type"],
        action,
        message,
        timestamp: extracted.timestamp,
        // Stage 4 新增字段：方便 UI / 测试脚本直接读 status / title / step
        status: extracted.status || undefined,
        title,
        step: extracted.step || undefined,
        metadata: {
          source: "fs-state",
          file: path.basename(filePath),
          error: extracted.error || undefined,
          step: extracted.step || undefined,
        },
      });
    } catch {
      // 单个文件异常不影响其他文件派生
      continue;
    }
  }

  // 按时间戳倒序（新的在前）；非法时间戳排末尾
  items.sort((a, b) => {
    const ta = new Date(a.timestamp).getTime();
    const tb = new Date(b.timestamp).getTime();
    if (isNaN(ta) && isNaN(tb)) return 0;
    if (isNaN(ta)) return 1;
    if (isNaN(tb)) return -1;
    return tb - ta;
  });

  const total = items.length;
  return { items: items.slice(0, limit), total };
}

// ─────────────────────────────────────────────
// Check if data source is empty
// ─────────────────────────────────────────────

export function isEmpty(): boolean {
  if (!fs.existsSync(OUTPUT_DIR)) return true;
  return !fs.readdirSync(OUTPUT_DIR).some((f) => f.startsWith(DEEP_DRAFT_PREFIX) && f.endsWith(".md"));
}
