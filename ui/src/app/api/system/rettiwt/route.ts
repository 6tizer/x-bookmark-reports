/**
 * GET /api/system/rettiwt — CLI vs npm rettiwt-api version, 6h cache
 */

import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import type { ApiResponse, RettiwtStatus } from "@/types/api";

const execFileAsync = promisify(execFile);

const CACHE_MS = 6 * 60 * 60 * 1000;
let cache: { at: number; payload: RettiwtStatus } | null = null;

function parseSemverCore(s: string): number[] {
  const core = s.replace(/^v/i, "").trim().split(/[-+]/)[0] ?? "";
  return core.split(".").map((x) => parseInt(x, 10) || 0);
}

/** True if a < b (strict semver numeric comparison) */
function semverLt(a: string, b: string): boolean {
  const pa = parseSemverCore(a);
  const pb = parseSemverCore(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da < db) return true;
    if (da > db) return false;
  }
  return false;
}

async function getLocalRettiwtVersion(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("rettiwt", ["--version"], {
      timeout: 8000,
    });
    const line = stdout.trim().split("\n")[0]?.trim() ?? "";
    const m = line.match(/(\d+\.\d+\.\d+[^\s]*)/);
    return m ? m[1] : line || null;
  } catch {
    return null;
  }
}

async function getNpmLatestVersion(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("npm", ["view", "rettiwt-api", "version"], {
      timeout: 15_000,
      env: { ...process.env, npm_config_loglevel: "silent" },
    });
    const v = stdout.trim().split("\n")[0]?.trim();
    return v || null;
  } catch {
    return null;
  }
}

export async function GET(): Promise<NextResponse<ApiResponse<RettiwtStatus>>> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) {
    return NextResponse.json({ success: true, data: cache.payload });
  }

  let localVersion: string | null = null;
  let latestVersion: string | null = null;
  const errors: string[] = [];

  try {
    localVersion = await getLocalRettiwtVersion();
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "rettiwt --version failed");
  }

  try {
    latestVersion = await getNpmLatestVersion();
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "npm view failed");
  }

  const updateAvailable = Boolean(
    localVersion &&
      latestVersion &&
      semverLt(localVersion, latestVersion)
  );

  const payload: RettiwtStatus = {
    localVersion,
    latestVersion,
    updateAvailable,
    error: errors.length ? errors.join("; ") : undefined,
    checkedAt: new Date().toISOString(),
  };

  cache = { at: now, payload };

  return NextResponse.json({ success: true, data: payload });
}
