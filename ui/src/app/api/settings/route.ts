/**
 * GET + PUT /api/settings
 * CONTRACT v1.0 — returns defaults when no DB data (filesystem mode)
 */

import { NextResponse } from "next/server";
import { isDbEmpty, getSettings, updateSettings } from "@/lib/db";
import { loadEnv, maskApiKey } from "@/lib/config";
import { getArticlesDir } from "@/lib/fs-data";
import { writeParentEnvArticlesDir } from "@/lib/parent-env";
import { getLogger } from "@/lib/logger";
import type { ApiResponse, Settings, UpdateSettingsRequest } from "@/types/api";

export const dynamic = "force-dynamic";

const logger = getLogger("system");

const defaultSettingsBase = {
  proxy: "http://127.0.0.1:7897",
  dataPath: "./data",
  autoSync: false,
  cronExpression: "0 16 * * *",
  apiKey: "****",
};

function defaultSettings(): Settings {
  return {
    ...defaultSettingsBase,
    articlesDir: getArticlesDir(),
  };
}

// ── GET ─────────────────────────────────────
export async function GET(): Promise<NextResponse<ApiResponse<Settings>>> {
  try {
    if (isDbEmpty()) {
      const env = loadEnv();
      const settings = defaultSettings();
      if (env.API_KEY) settings.apiKey = maskApiKey(env.API_KEY);
      if (env.PROXY) settings.proxy = env.PROXY;
      if (env.DATA_PATH) settings.dataPath = env.DATA_PATH;
      return NextResponse.json({ success: true, data: settings });
    }

    const dbSettings = getSettings();
    const env = loadEnv();
    if (env.API_KEY) dbSettings.apiKey = maskApiKey(env.API_KEY);
    if (env.PROXY) dbSettings.proxy = env.PROXY;
    if (env.DATA_PATH) dbSettings.dataPath = env.DATA_PATH;
    if (env.AUTO_SYNC) {
      dbSettings.autoSync = env.AUTO_SYNC === "true" || env.AUTO_SYNC === "1";
    }
    if (env.CRON_EXPRESSION) {
      dbSettings.cronExpression = env.CRON_EXPRESSION;
    }
    if (!dbSettings.articlesDir) {
      dbSettings.articlesDir = getArticlesDir();
    }

    return NextResponse.json({ success: true, data: dbSettings });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        data: defaultSettings(),
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

    if (isDbEmpty()) {
      if (body.articlesDir !== undefined && body.articlesDir.trim()) {
        const ok = writeParentEnvArticlesDir(body.articlesDir.trim());
        if (!ok) {
          logger.warn("Failed to persist ARTICLES_DIR to repo .env");
        }
        process.env.ARTICLES_DIR = body.articlesDir.trim();
      }
      return NextResponse.json({
        success: true,
        data: {
          ...defaultSettings(),
          proxy: body.proxy ?? defaultSettings().proxy,
          dataPath: body.dataPath ?? defaultSettings().dataPath,
          articlesDir: body.articlesDir?.trim() || getArticlesDir(),
          autoSync: body.autoSync ?? defaultSettings().autoSync,
          cronExpression: body.cronExpression ?? defaultSettings().cronExpression,
        },
      });
    }

    const ok = updateSettings({
      proxy: body.proxy ?? undefined,
      dataPath: body.dataPath,
      autoSync: body.autoSync,
      cronExpression: body.cronExpression ?? undefined,
    });

    if (!ok) {
      return NextResponse.json(
        {
          success: false,
          data: defaultSettings(),
          error: { code: "SETTINGS_SAVE_ERROR", message: "Failed to save settings" },
        },
        { status: 500 }
      );
    }

    logger.info("Settings updated");
    const updated = getSettings();
    if (!updated.articlesDir) updated.articlesDir = getArticlesDir();
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        data: defaultSettings(),
        error: { code: "SETTINGS_SAVE_ERROR", message, detail: String(err) },
      },
      { status: 500 }
    );
  }
}
