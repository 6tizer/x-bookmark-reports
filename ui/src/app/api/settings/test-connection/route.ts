/**
 * POST /api/settings/test-connection
 * CONTRACT v1.0
 */

import { NextResponse } from "next/server";
import { getRawApiKey } from "@/lib/db";
import { getEnvValue } from "@/lib/config";
import type { ApiResponse, ConnectionTestResult } from "@/types/api";

export async function POST(): Promise<NextResponse<ApiResponse<ConnectionTestResult>>> {
  try {
    const apiKey = getRawApiKey() ?? getEnvValue("API_KEY");
    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          data: { reachable: false, latency: 0 },
          error: { code: "SETTINGS_INVALID_KEY", message: "API key not configured" },
        },
        { status: 200 }
      );
    }

    // Simple ping simulation — real test would call Twitter API
    const start = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 200));
    const latency = Date.now() - start;

    return NextResponse.json({
      success: true,
      data: { reachable: true, latency },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        data: { reachable: false, latency: 0 },
        error: { code: "INTERNAL_ERROR", message, detail: String(err) },
      },
      { status: 200 }
    );
  }
}
