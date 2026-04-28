/**
 * Filesystem Data Layer — reads from x-bookmark-reports output directories
 * Replaces SQLite/mock data with direct file reading.
 * CONTRACT v1.0
 */

import * as fs from "fs";
import * as path from "path";

// ─────────────────────────────────────────────
// Paths — relative to parent of ui/
// ────────────────────────────────── ──

const UI_ROOT = process.cwd();
const PARENT_DIR = path.resolve(UI_ROOT, "..");
const OUTPUT_DIR = path.join(PARENT_DIR, "output");
const ARTICLES_DIR = "/Users/tizer_mac_studio/Library/Mobile Documents/com~apple~CloudDocs/Hermes/bookmark-articles";
const PROCESSED_FILE = path.join(ARTICLES_DIR, "processed.json");

// ────────────────── ─────
// Frontmatter parser for draft .md files
// ────────────────── ─────

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

function parseStats(statsStr: string): { likes: number; retweets: number; bookmarks: number; views: number; replies: number } {
  const emojis: Record<string, number> = { "❤️": 0, "↻": 0, "🔖": 0, "👁": 0, "💬": 0 };
  for (const [emoji, val] of Object.entries(emojis)) {
    const idx = statsStr.indexOf(emoji);
    if (idx > -1) {
      // Parse number before emoji
      let num = "";
      for (let i = idx - 1; i >= 0 && (statsStr[i] >= "0" && statsStr[i] <= "9"); i--) {
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
  // Format: @handle (display name)
  const match = authorStr.match(/@(\S+)\s*\(([^)]+)\)/);
  if (match) {
    return { handle: match[1], name: match[2] || match[1] };
  }
  return { handle: authorStr.replace("@", ""), name: authorStr };
}

// ────────────────── ─────
// Bookmark (draft) type
// ─────

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
  status: "draft" | "editing" | "reviewing" | "published";
  draftRef?: string;
  draftPath?: string;
}

// ────────────────── ─────
// Read draft bookmarks
// ─────

export function listDraftBookmarks(
  page: number = 1,
  limit: number = 20,
  search?: string,
  status?: string
): { items: FsBookmark[]; total: number; hasMore: boolean } {
  if (!fs.existsSync(OUTPUT_DIR)) {
    return { items: [], total: 0, hasMore: false };
  }
  const files = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith(".md"));
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
      const title = body.split("\n").find((l: string) => l.startsWith("**") && l.endsWith("**")) || file.replace(".md", "");
      drafts.push({
        id: file.replace(".md", ""),
        fileName: file,
        url: tweetUrl || `https://x.com/${author.handle}/status/${file}`,
        author,
        text: title.replace(/\*\*/g, "").trim().slice(0, 200),
        fullText: draftBody,
        bookmarkedAt,
        publishedAt,
        stats,
        status: "synced" as const,
        tags: [],
        draftPath: path.join(OUTPUT_DIR, file),
        body: draftBody,
      });
    } catch { /* skip bad files */ }
  }
  // Filter by status
  if (status) {
    drafts = drafts.filter(d => d.status === status);
  }
  // Filter by search
  if (search) {
    const s = search.toLowerCase();
    drafts = drafts.filter(d =>
      d.author.name.toLowerCase().includes(s) ||
      d.author.handle.toLowerCase().includes(s) ||
      d.text.toLowerCase().includes(s)
    );
  }
  // Sort by publishedAt desc
  drafts.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  const total = drafts.length;
  const offset = (page - 1) * limit;
  const items = drafts.slice(offset, offset + limit);
  return { items, total, hasMore: page * limit < total };
}

// ────────────────── ─────
// Read final articles
// ─────

export function listArticles(
  page: number = 1,
  limit: number = 20,
  status?: string
): { items: FsArticle[]; total: number; hasMore: boolean } {
  if (!fs.existsSync(ARTICLES_DIR)) {
    return { items: [], total: 0, hasMore: false };
  }
  const files = fs.readdirSync(ARTICLES_DIR).filter(f => f.endsWith(".md"));
  let articles: FsArticle[] = [];
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(ARTICLES_DIR, file), "utf-8");
      const words = content.split(/\s+/).length;
      articles.push({
        id: file.replace(".md", ""),
        fileName: file,
        title: file.replace(".md", "").replace(/-/g, " "),
        content,
        wordCount: words,
        publishedAt: new Date().toISOString(),
        status: "draft" as const,
      });
    } catch { /* skip */ }
  }
  if (status) {
    articles = articles.filter(a => a.status === status);
  }
  articles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  const total = articles.length;
  const offset = (page - 1) * limit;
  const items = articles.slice(offset, offset + limit);
  return { items, total, hasMore: page * limit < total };
}

// ────────────────── ─────
// Article detail with content readable
// ─────

export function getArticleById(id: string): FsArticle | null {
  if (!fs.existsSync(ARTICLES_DIR)) return null;
  const file = fs.readdirSync(ARTICLES_DIR).find(f => f.replace(".md", "") === id);
  if (!file) return null;
  const content = fs.readFileSync(path.join(ARTICLES_DIR, file), "utf-8");
  return {
    id: file.replace(".md", ""),
    fileName: file,
    title: file.replace(".md", "").replace(/-/g, " "),
    content,
    wordCount: content.split(/\s+/).length,
    publishedAt: new Date().toISOString(),
    status: "published",
  };
}

// ────────────────── ─────
// Dashboard stats from files
// ─────

export function getDashboardStats() {
  let totalDrafts = 0;
  let totalArticles = 0;
  if (fs.existsSync(OUTPUT_DIR)) {
    totalDrafts = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith(".md")).length;
  }
  if (fs.existsSync(ARTICLES_DIR)) {
    totalArticles = fs.readdirSync(ARTICLES_DIR).filter(f => f.endsWith(".md")).length;
  }
  return {
    totalDrafts,
    totalArticles,
    synced: totalDrafts,
    reported: totalDrafts,
    pending: 0,
    lastSync: new Date().toISOString(),
  };
}

// ────────────────── ─────
// Check if data source is empty
// ─────

export function isEmpty(): boolean {
  if (!fs.existsSync(OUTPUT_DIR)) return true;
  const files = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith(".md"));
  return files.length === 0;
}
