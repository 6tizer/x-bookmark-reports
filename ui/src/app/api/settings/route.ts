/**
 * GET + PUT /api/settings
 * Reads all config from .env file (repo root). API keys are masked in GET responses.
 * PUT writes specified fields back to .env.
 */

import { NextResponse } from "next/server";
import { loadEnv, updateEnv, maskApiKey } from "@/lib/config";
import { getArticlesDir } from "@/lib/fs-data";
import { getLogger } from "@/lib/logger";
import type { ApiResponse, Settings, UpdateSettingsRequest } from "@/types/api";

export const dynamic = "force-dynamic";

const logger = getLogger("system");

function buildSettingsFromEnv(): Settings {
  const env = loadEnv();
  return {
    twitterApiKey: maskApiKey(env.TWITTER_API_IO_KEY || env.API_KEY),
    notionToken: maskApiKey(env.NOTION_TOKEN),
    notionDbId: env.NOTION_DB_ID || "",
    deepseekApiKey: maskApiKey(env.DEEPSEEK_API_KEY),
    deepseekBaseUrl: env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1",
    deepseekModel: env.DEEPSEEK_MODEL || "deepseek-chat",
    xaiApiKey: maskApiKey(env.XAI_API_KEY),
    xaiBaseUrl: env.XAI_BASE_URL || "https://api.x.ai/v1",
    exaApiKey: maskApiKey(env.EXA_API_KEY),
    exaBaseUrl: env.EXA_BASE_URL || "https://api.exa.ai",
    bookmarksPath: env.BOOKMARKS_PATH || "",
    articlesDir: env.ARTICLES_DIR || getArticlesDir(),
    dataPath: env.DATA_PATH || "./data",
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
    if (body.exaBaseUrl !== undefined) {
      envUpdates.EXA_BASE_URL = body.exaBaseUrl;
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
