/**
 * Notion DB Stats — query Notion database for article counts by status.
 * Reads NOTION_TOKEN / NOTION_DB_ID from REPO_ROOT/.env via fs.
 * 5-minute in-memory cache.
 */

import * as fs from "fs";
import * as path from "path";
import { getRepoRoot } from "@/lib/repo-root";

export interface NotionDbStats {
  totalRecords: number;       // DB total → Finished in Notion
  articlesWritten: number;    // 已发布 + 已完成 → Articles Written
  pendingRewrite: number;     // 待处理 + 已提取 → Pending Rewrite
}

// ─────────────────────────────────────────────
// Env parsing
// ─────────────────────────────────────────────

function parseEnv(): { notionToken: string; notionDbId: string } | null {
  const envPath = path.join(getRepoRoot(), ".env");
  if (!fs.existsSync(envPath)) return null;
  try {
    const raw = fs.readFileSync(envPath, "utf-8");
    let notionToken = "";
    let notionDbId = "";
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const eqIdx = trimmed.indexOf("=");
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (key === "NOTION_TOKEN") notionToken = val;
      if (key === "NOTION_DB_ID") notionDbId = val;
    }
    if (!notionToken || !notionDbId) return null;
    return { notionToken, notionDbId };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// Notion API query with pagination
// ─────────────────────────────────────────────

const STATUS_PROPERTY = "状态";

const STATUS_PUBLISHED = "已发布";
const STATUS_COMPLETED = "已完成";
const STATUS_PENDING = "待处理";
const STATUS_EXTRACTED = "已提取";

interface NotionPage {
  id: string;
  properties: Record<string, unknown>;
}

interface NotionQueryResponse {
  results: NotionPage[];
  has_more: boolean;
  next_cursor: string | null;
}

async function queryAllPages(
  notionToken: string,
  notionDbId: string,
  filter?: Record<string, unknown>
): Promise<NotionPage[]> {
  const url = `https://api.notion.com/v1/databases/${notionDbId}/query`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${notionToken}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  };

  let allPages: NotionPage[] = [];
  let hasMore = true;
  let nextCursor: string | null = null;

  while (hasMore) {
    const body: Record<string, unknown> = { page_size: 100 };
    if (filter) body.filter = filter;
    if (nextCursor) body.start_cursor = nextCursor;

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Notion API ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as NotionQueryResponse;
    allPages = allPages.concat(data.results || []);
    hasMore = data.has_more;
    nextCursor = data.next_cursor;
  }

  return allPages;
}

function getStatusFromPage(page: NotionPage): string {
  const prop = page.properties[STATUS_PROPERTY];
  if (!prop || typeof prop !== "object") return "";
  const select = (prop as { select?: { name?: string } }).select;
  return select?.name ?? "";
}

// ─────────────────────────────────────────────
// Cache (5 minutes)
// ─────────────────────────────────────────────

let cachedStats: NotionDbStats | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getNotionDbStats(): Promise<NotionDbStats | null> {
  const now = Date.now();
  if (cachedStats && now - cachedAt < CACHE_TTL_MS) {
    return cachedStats;
  }

  const env = parseEnv();
  if (!env) return null;

  try {
    const pages = await queryAllPages(env.notionToken, env.notionDbId);

    let articlesWritten = 0;
    let pendingRewrite = 0;

    for (const page of pages) {
      const status = getStatusFromPage(page);
      if (status === STATUS_PUBLISHED || status === STATUS_COMPLETED) {
        articlesWritten++;
      } else if (status === STATUS_PENDING || status === STATUS_EXTRACTED) {
        pendingRewrite++;
      }
    }

    const stats: NotionDbStats = {
      totalRecords: pages.length,
      articlesWritten,
      pendingRewrite,
    };

    cachedStats = stats;
    cachedAt = now;
    return stats;
  } catch {
    return null;
  }
}
