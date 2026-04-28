/**
 * GET + PUT /api/settings
 * CONTRACT v1.0 — returns defaults when no DB data (filesystem mode)
 */

import { NextResponse } from "next/server";
import { isDbEmpty, getSettings, updateSettings } from "@/lib/db";
import { loadEnv, maskApiKey } from "@/lib/config";
import { getLogger } from "@/lib/logger";
import type { ApiResponse, Settings, UpdateSettingsRequest } from "@/types/api";

const logger = getLogger("system");

const defaultSettings: Settings = {
  proxy: "http://127.0.0.1:7897",
  dataPath: "./data",
  autoSync: false,
  cronExpression: "0 16 * * *",
  apiKey: "****",
};

// ── GET ─────────────────────────────────────
export async function GET(): Promise<NextResponse<ApiResponse<Settings>>> {
  try {
    if (isDbEmpty()) {
      // Merge env vars into defaults
      const env = loadEnv();
      const settings = { ...defaultSettings };
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

    return NextResponse.json({ success: true, data: dbSettings });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        data: defaultSettings,
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
      // Read-only filesystem mode — just echo back
      return NextResponse.json({
        success: true,
        data: {
          ...defaultSettings,
          proxy: body.proxy ?? defaultSettings.proxy,
          dataPath: body.dataPath ?? defaultSettings.dataPath,
          autoSync: body.autoSync ?? defaultSettings.autoSync,
          cronExpression: body.cronExpression ?? defaultSettings.cronExpression,
        },
      });
    }

    const ok = updateSettings({
      proxy: body.proxy,
      dataPath: body.dataPath,
      autoSync: body.autoSync,
      cronExpression: body.cronExpression,
    });

    if (!ok) {
      return NextResponse.json(
        {
          success: false,
          data: defaultSettings,
          error: { code: "SETTINGS_SAVE_ERROR", message: "Failed to save settings" },
        },
        { status: 500 }
      );
    }

    logger.info("Settings updated");
    const updated = getSettings();
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        data: defaultSettings,
        error: { code: "SETTINGS_SAVE_ERROR", message, detail: String(err) },
      },
      { status: 500 }
    );
  }
}
