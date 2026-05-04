/**
 * GET /api/settings/api-key — Returns plaintext value for a specific key (for reveal toggle)
 * PUT /api/settings/api-key — Updates any API key in .env
 */

import { NextResponse } from "next/server";
import { getEnvValue, updateEnv, decodeBase64ApiKey, maskApiKey } from "@/lib/config";
import { getLogger } from "@/lib/logger";
import type { ApiResponse, UpdateApiKeyRequest, ApiKeyName } from "@/types/api";

const logger = getLogger("system");

const API_KEY_ENV_MAP: Record<ApiKeyName, string> = {
  TWITTER_API_IO_KEY: "TWITTER_API_IO_KEY",
  NOTION_TOKEN: "NOTION_TOKEN",
  DEEPSEEK_API_KEY: "DEEPSEEK_API_KEY",
  XAI_API_KEY: "XAI_API_KEY",
  EXA_API_KEY: "EXA_API_KEY",
};

// ── GET: Reveal a single key's plaintext value ─────────────────────
export async function GET(
  request: Request
): Promise<NextResponse<ApiResponse<{ keyName: string; value: string }>>> {
  try {
    const url = new URL(request.url);
    const keyName = url.searchParams.get("keyName") as ApiKeyName | null;

    if (!keyName || !API_KEY_ENV_MAP[keyName]) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: {
            code: "SETTINGS_INVALID_KEY",
            message: `Invalid key name. Must be one of: ${Object.keys(API_KEY_ENV_MAP).join(", ")}`,
          },
        },
        { status: 400 }
      );
    }

    const envKey = API_KEY_ENV_MAP[keyName];
    const rawValue = getEnvValue(envKey as keyof import("@/lib/config").RawEnvConfig);

    return NextResponse.json({
      success: true,
      data: { keyName, value: rawValue || "" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, data: null, error: { code: "SETTINGS_READ_ERROR", message } },
      { status: 500 }
    );
  }
}

// ── PUT: Update a key ────────────────────────────────────────────────
export async function PUT(
  request: Request
): Promise<NextResponse<ApiResponse<{ masked: string }>>> {
  try {
    const body = (await request.json()) as UpdateApiKeyRequest;

    if (!body.keyName || !API_KEY_ENV_MAP[body.keyName]) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: {
            code: "SETTINGS_INVALID_KEY",
            message: `Invalid key name. Must be one of: ${Object.keys(API_KEY_ENV_MAP).join(", ")}`,
          },
        },
        { status: 400 }
      );
    }

    if (!body.apiKey) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: { code: "SETTINGS_INVALID_KEY", message: "Missing API key value" },
        },
        { status: 400 }
      );
    }

    const decoded = decodeBase64ApiKey(body.apiKey);
    if (!decoded || decoded.length < 4) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: { code: "SETTINGS_INVALID_KEY", message: "API key too short or invalid" },
        },
        { status: 400 }
      );
    }

    const envKey = API_KEY_ENV_MAP[body.keyName];
    const ok = updateEnv({ [envKey]: decoded } as Record<string, string>);
    if (!ok) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: { code: "SETTINGS_SAVE_ERROR", message: "Failed to write .env" },
        },
        { status: 500 }
      );
    }

    logger.info(`${body.keyName} updated`);
    return NextResponse.json({
      success: true,
      data: { masked: maskApiKey(decoded) },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: { code: "SETTINGS_SAVE_ERROR", message, detail: String(err) },
      },
      { status: 500 }
    );
  }
}
