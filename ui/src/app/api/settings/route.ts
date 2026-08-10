/**
 * GET + PUT /api/settings
 * Reads all config from .env file (repo root). API keys are masked in GET responses.
 * PUT writes specified fields back to .env.
 *
 * 路径绝对化策略（PR-3 Commit 8）：
 * - GET：把 BOOKMARKS_PATH / ARTICLES_DIR / DATA_PATH 相对路径统一转成绝对路径（相对 repoRoot），
 *   让 UI 看到的永远是绝对路径，避免显示「../twitter_data/...」这类相对值造成困惑。
 * - PUT：原样写回 .env，保留用户输入（可能是相对路径）。
 */

import { NextResponse } from "next/server";
import path from "path";
import { loadEnv, updateEnv, maskApiKey } from "@/lib/config";
import { getArticlesDir } from "@/lib/fs-data";
import { getRepoRoot } from "@/lib/repo-root";
import { getLogger } from "@/lib/logger";
import type { ApiResponse, Settings, UpdateSettingsRequest } from "@/types/api";

export const dynamic = "force-dynamic";

const logger = getLogger("system");

/**
 * 把任意路径规范化为绝对路径。
 * - 空值 → 返回 fallback
 * - 已是绝对路径 → 原样返回
 * - 相对路径（含 ~/... 形式不在此处理，dotenv 通常不会自动 expand ~）→ 相对 repoRoot 解析
 */
function toAbsolutePath(p: string | undefined, repoRoot: string, fallback: string): string {
  if (!p || !p.trim()) return fallback;
  return path.isAbsolute(p) ? p : path.resolve(repoRoot, p);
}

function buildSettingsFromEnv(): Settings {
  const env = loadEnv();
  const repoRoot = getRepoRoot();
  // 路径绝对化：GET 时显示绝对路径；.env 中的相对路径（如 ../twitter_data/...）
  // 会被解析成相对 repoRoot 的绝对路径。
  const bookmarksPathAbs = toAbsolutePath(env.BOOKMARKS_PATH, repoRoot, "");
  const articlesDirAbs = toAbsolutePath(env.ARTICLES_DIR, repoRoot, getArticlesDir());
  const dataPathAbs = toAbsolutePath(env.DATA_PATH, repoRoot, path.join(repoRoot, "data"));
  return {
    twitterApiKey: maskApiKey(env.TWITTER_API_IO_KEY || env.API_KEY),
    notionToken: maskApiKey(env.NOTION_TOKEN),
    notionDbId: env.NOTION_DB_ID || "",
    deepseekApiKey: maskApiKey(env.DEEPSEEK_API_KEY),
    deepseekBaseUrl: env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1",
    deepseekModel: env.DEEPSEEK_MODEL || "deepseek-v4-flash",
    xaiApiKey: maskApiKey(env.XAI_API_KEY),
    xaiBaseUrl: env.XAI_BASE_URL || "https://api.x.ai/v1",
    xaiModel: env.XAI_MODEL || "grok-4.3",
    exaApiKey: maskApiKey(env.EXA_API_KEY),
    exaBaseUrl: env.EXA_BASE_URL || "https://api.exa.ai",
    searxngBaseUrl: env.SEARXNG_BASE_URL || "http://100.99.184.51:8888",
    firecrawlApiKey: maskApiKey(env.FIRECRAWL_API_KEY),
    firecrawlBaseUrl: env.FIRECRAWL_BASE_URL || "https://api.firecrawl.dev/v2",
    bookmarksPath: bookmarksPathAbs,
    articlesDir: articlesDirAbs,
    dataPath: dataPathAbs,
    proxy: env.PROXY || null,
    // @deprecated：Auto Sync + cron env 已删除（PR-3），字段保留供旧 UI 兼容，恒返回 false/null
    autoSync: false,
    notionUploadLive: env.NOTION_UPLOAD_LIVE === "true" || env.NOTION_UPLOAD_LIVE === "1",
    cronExpression: null,
  };
}

// ── GET ─────────────────────────────────────
export async function GET(): Promise<NextResponse<ApiResponse<Settings>>> {
  try {
    const settings = buildSettingsFromEnv();
    return NextResponse.json({ success: true, data: settings });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        data: buildSettingsFromEnv(),
        error: { code: "INTERNAL_ERROR", message, detail: String(err) },
      },
      { status: 500 }
    );
  }
}

// ── PUT ─────────────────────────────────────
export async function PUT(
  request: Request
): Promise<NextResponse<ApiResponse<Settings>>> {
  try {
    const body = (await request.json()) as UpdateSettingsRequest;

    const envUpdates: Record<string, string> = {};

    if (body.proxy !== undefined) {
      envUpdates.PROXY = body.proxy || "";
    }
    if (body.dataPath !== undefined) {
      envUpdates.DATA_PATH = body.dataPath;
    }
    if (body.articlesDir !== undefined && body.articlesDir.trim()) {
      envUpdates.ARTICLES_DIR = body.articlesDir.trim();
      process.env.ARTICLES_DIR = body.articlesDir.trim();
    }
    if (body.bookmarksPath !== undefined) {
      envUpdates.BOOKMARKS_PATH = body.bookmarksPath;
    }
    if (body.notionUploadLive !== undefined) {
      envUpdates.NOTION_UPLOAD_LIVE = body.notionUploadLive ? "true" : "false";
    }
    if (body.notionDbId !== undefined) {
      envUpdates.NOTION_DB_ID = body.notionDbId;
    }
    if (body.deepseekBaseUrl !== undefined) {
      envUpdates.DEEPSEEK_BASE_URL = body.deepseekBaseUrl;
    }
    if (body.deepseekModel !== undefined) {
      envUpdates.DEEPSEEK_MODEL = body.deepseekModel;
    }
    if (body.xaiBaseUrl !== undefined) {
      envUpdates.XAI_BASE_URL = body.xaiBaseUrl;
    }
    if (body.xaiModel !== undefined) {
      envUpdates.XAI_MODEL = body.xaiModel;
    }
    if (body.exaBaseUrl !== undefined) {
      envUpdates.EXA_BASE_URL = body.exaBaseUrl;
    }
    if (body.searxngBaseUrl !== undefined) {
      envUpdates.SEARXNG_BASE_URL = body.searxngBaseUrl;
    }
    if (body.firecrawlBaseUrl !== undefined) {
      envUpdates.FIRECRAWL_BASE_URL = body.firecrawlBaseUrl;
    }

    if (Object.keys(envUpdates).length > 0) {
      const ok = updateEnv(envUpdates);
      if (!ok) {
        return NextResponse.json(
          {
            success: false,
            data: buildSettingsFromEnv(),
            error: { code: "SETTINGS_SAVE_ERROR", message: "Failed to save settings to .env" },
          },
          { status: 500 }
        );
      }
    }

    logger.info("Settings updated");
    const settings = buildSettingsFromEnv();
    return NextResponse.json({ success: true, data: settings });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        data: buildSettingsFromEnv(),
        error: { code: "SETTINGS_SAVE_ERROR", message, detail: String(err) },
      },
      { status: 500 }
    );
  }
}
