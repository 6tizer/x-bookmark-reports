/**
 * PUT /api/settings/api-key
 * CONTRACT v1.0
 */

import { NextResponse } from "next/server";
import { isDbEmpty, updateApiKey } from "@/lib/db";
import { updateEnv, decodeBase64ApiKey, maskApiKey } from "@/lib/config";
import { mockSettings } from "@/db/mock";
import { getLogger } from "@/lib/logger";
import type { ApiResponse, Settings, UpdateApiKeyRequest } from "@/types/api";

const logger = getLogger("system");

export async function PUT(
  request: Request
): Promise<NextResponse<ApiResponse<Settings>>> {
  try {
    const body = (await request.json()) as UpdateApiKeyRequest;

    if (!body.apiKey) {
      return NextResponse.json(
        {
          success: false,
          data: mockSettings,
          error: { code: "SETTINGS_INVALID_KEY", message: "Missing API key" },
        },
        { status: 400 }
      );
    }

    const decoded = decodeBase64ApiKey(body.apiKey);
    if (!decoded || decoded.length < 8) {
      return NextResponse.json(
        {
          success: false,
          data: mockSettings,
          error: { code: "SETTINGS_INVALID_KEY", message: "API key too short or invalid" },
        },
        { status: 400 }
      );
    }

    if (!isDbEmpty()) {
      updateApiKey(decoded);
    }
    updateEnv({ API_KEY: decoded });

    logger.info("API key updated");
    return NextResponse.json({
      success: true,
      data: {
        ...mockSettings,
        apiKey: maskApiKey(decoded),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        data: mockSettings,
        error: { code: "SETTINGS_SAVE_ERROR", message, detail: String(err) },
      },
      { status: 200 }
    );
  }
}
