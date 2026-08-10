/**
 * GET /api/system/rettiwt — CLI vs npm rettiwt-api version, 6h cache
 */

import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import type { ApiResponse, RettiwtStatus } from "@/types/api";

export const dynamic = "force-dynamic";

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

/** 从 rettiwt CLI 路径解析 rettiwt-api/package.json 的 version */
function versionFromCliPath(binPath: string): string | null {
  try {
    const resolved = fs.realpathSync(binPath);
    // .../rettiwt-api/dist/cli.js → .../rettiwt-api/package.json
    const pkgJson = path.resolve(path.dirname(resolved), "..", "package.json");
    if (!fs.existsSync(pkgJson)) return null;
    const pkg = JSON.parse(fs.readFileSync(pkgJson, "utf-8")) as {
      name?: string;
      version?: string;
    };
    if (pkg.name && pkg.name !== "rettiwt-api") return null;
    return typeof pkg.version === "string" ? pkg.version : null;
  } catch {
    return null;
  }
}

async function resolveRettiwtBin(): Promise<string | null> {
  const home = process.env.HOME || "";
  const candidates = [
    "/usr/local/bin/rettiwt",
    home ? `${home}/.local/bin/rettiwt` : "",
    "rettiwt",
  ].filter(Boolean);

  for (const bin of candidates) {
    if (bin.includes(path.sep)) {
      if (fs.existsSync(bin)) return bin;
      continue;
    }
    // PATH 查找
    try {
      const { stdout } = await execFileAsync("which", [bin], {
        timeout: 3000,
        env: {
          ...process.env,
          PATH: `${home}/.local/bin:/usr/local/bin:/opt/homebrew/bin:${process.env.PATH || ""}`,
        },
      });
      const found = stdout.trim().split("\n")[0];
      if (found) return found;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function getLocalRettiwtVersion(): Promise<{
  version: string | null;
  error?: string;
}> {
  // rettiwt CLI 无 --version；从安装包 package.json 读取
  const bin = await resolveRettiwtBin();
  if (!bin) {
    return { version: null, error: "rettiwt binary not found in PATH fallbacks" };
  }
  const version = versionFromCliPath(bin);
  if (version) return { version };
  return {
    version: null,
    error: `rettiwt found at ${bin} but package.json version unreadable`,
  };
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
    const local = await getLocalRettiwtVersion();
    localVersion = local.version;
    if (!localVersion && local.error) {
      errors.push(local.error);
    }
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
