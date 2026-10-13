/**
 * Config Service — .env management (repo root)
 * Reads/writes settings from the project root .env file, with fallback support
 * for cache/.cf_browser_token and atomic line-preserving updates.
 */

import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { getRepoRoot } from "@/lib/repo-root";

const ENV_PATH = path.join(getRepoRoot(), ".env");
const CF_TOKEN_CACHE_PATH = path.join(getRepoRoot(), "cache", ".cf_browser_token");
const CF_USAGE_LEDGER_PATH = path.join(getRepoRoot(), "cache", "cf_browser_usage.json");

export interface RawEnvConfig {
  // API Keys
  TWITTER_API_IO_KEY?: string;
  NOTION_TOKEN?: string;
  NOTION_DB_ID?: string;
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_BASE_URL?: string;
  DEEPSEEK_MODEL?: string;
  XAI_API_KEY?: string;
  XAI_BASE_URL?: string;
  XAI_MODEL?: string;
  EXA_API_KEY?: string;
  EXA_BASE_URL?: string;
  SEARXNG_BASE_URL?: string;
  FIRECRAWL_API_KEY?: string;
  FIRECRAWL_BASE_URL?: string;
  // Cloudflare Browser Run
  CF_ACCOUNT_ID?: string;
  CF_BROWSER_API_TOKEN?: string;
  CF_BROWSER_ENABLED?: string;
  CF_BROWSER_DAILY_MS_BUDGET?: string;
  // Paths
  BOOKMARKS_PATH?: string;
  ARTICLES_DIR?: string;
  DATA_PATH?: string;
  PROXY?: string;
  // Toggles
  NOTION_UPLOAD_LIVE?: string;
  // Legacy
  API_KEY?: string;
}

export const API_KEY_ENV_NAMES = [
  "TWITTER_API_IO_KEY",
  "NOTION_TOKEN",
  "DEEPSEEK_API_KEY",
  "XAI_API_KEY",
  "EXA_API_KEY",
  "FIRECRAWL_API_KEY",
  "CF_BROWSER_API_TOKEN",
] as const;

function readEnvFile(): RawEnvConfig {
  if (!fs.existsSync(ENV_PATH)) {
    return {};
  }
  const parsed = dotenv.parse(fs.readFileSync(ENV_PATH, "utf-8"));
  return parsed as RawEnvConfig;
}

/**
 * 读取本地 0600 缓存文件中的 Cloudflare Browser Run Token（当 .env 未填时作为默认回退）。
 */
export function getCfBrowserTokenFallback(): string {
  try {
    if (fs.existsSync(CF_TOKEN_CACHE_PATH)) {
      return fs.readFileSync(CF_TOKEN_CACHE_PATH, "utf-8").trim();
    }
  } catch {
    /* ignore */
  }
  return "";
}

/**
 * 读取今日（UTC）Cloudflare Browser Run 已使用的毫秒数与预算。
 */
export function getCfBrowserDailyUsage(): { usedMs: number; budgetMs: number; calls: number; exhausted: boolean } {
  const env = readEnvFile();
  const budgetMs = parseInt(env.CF_BROWSER_DAILY_MS_BUDGET || "480000", 10) || 480000;
  try {
    if (!fs.existsSync(CF_USAGE_LEDGER_PATH)) {
      return { usedMs: 0, budgetMs, calls: 0, exhausted: false };
    }
    const raw = JSON.parse(fs.readFileSync(CF_USAGE_LEDGER_PATH, "utf-8")) as {
      date_utc?: string;
      used_ms?: number;
      calls?: number;
      exhausted_until?: number;
    };
    const todayUtc = new Date().toISOString().slice(0, 10);
    if (raw.date_utc !== todayUtc) {
      return { usedMs: 0, budgetMs, calls: 0, exhausted: false };
    }
    const usedMs = Number(raw.used_ms || 0);
    const calls = Number(raw.calls || 0);
    const exhausted =
      usedMs >= budgetMs || Number(raw.exhausted_until || 0) > Date.now() / 1000;
    return { usedMs, budgetMs, calls, exhausted };
  } catch {
    return { usedMs: 0, budgetMs, calls: 0, exhausted: false };
  }
}

/**
 * 格式化单个 .env 键值行：若值不含空格/引号/#，直接裸写；否则使用单引号包裹（Node dotenv 与 python-dotenv 行为一致）。
 */
function formatEnvLine(key: string, value: string): string {
  if (/^[A-Za-z0-9_./:@+-]*$/.test(value)) {
    return `${key}=${value}`;
  }
  const safe = value.replace(/'/g, "");
  return `${key}='${safe}'`;
}

/**
 * 逐行原地更新 .env 文件并原子替换（保留注释、空行与未修改行的原始格式，修复 B-UI-ENV-WRITE-AND-KEY-AUTH）。
 */
function writeEnvFile(updates: Partial<RawEnvConfig>): void {
  const existingContent = fs.existsSync(ENV_PATH)
    ? fs.readFileSync(ENV_PATH, "utf-8")
    : "";
  const lines = existingContent ? existingContent.split(/\r?\n/) : [];
  const remaining = new Map<string, string>();

  for (const [k, v] of Object.entries(updates)) {
    if (v !== undefined && v !== null) {
      remaining.set(k, String(v));
    }
  }

  const updatedLines = lines.map((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (!match) return line;
    const key = match[1];
    if (!remaining.has(key)) return line;
    const val = remaining.get(key)!;
    remaining.delete(key);
    return formatEnvLine(key, val);
  });

  // 移除末尾多余空行后再追加新增键
  while (updatedLines.length > 0 && updatedLines[updatedLines.length - 1] === "") {
    updatedLines.pop();
  }
  for (const [key, val] of Array.from(remaining.entries())) {
    updatedLines.push(formatEnvLine(key, val));
  }

  const tmpPath = `${ENV_PATH}.tmp.${process.pid}`;
  fs.writeFileSync(tmpPath, updatedLines.join("\n") + "\n", "utf-8");
  fs.renameSync(tmpPath, ENV_PATH);
}

export function loadEnv(): RawEnvConfig {
  dotenv.config({ path: ENV_PATH });
  return readEnvFile();
}

export function getEnvValue(key: keyof RawEnvConfig): string | undefined {
  const env = readEnvFile();
  if (key === "CF_BROWSER_API_TOKEN" && !env.CF_BROWSER_API_TOKEN) {
    const fallback = getCfBrowserTokenFallback();
    return fallback || undefined;
  }
  return env[key];
}

export function updateEnv(updates: Partial<RawEnvConfig>): boolean {
  try {
    writeEnvFile(updates);
    if (updates.CF_BROWSER_API_TOKEN) {
      try {
        fs.mkdirSync(path.dirname(CF_TOKEN_CACHE_PATH), { recursive: true });
        fs.writeFileSync(CF_TOKEN_CACHE_PATH, `${updates.CF_BROWSER_API_TOKEN.trim()}\n`, {
          encoding: "utf-8",
          mode: 0o600,
        });
      } catch {
        /* ignore fallback sync error */
      }
    }
    return true;
  } catch (err) {
    console.error("Failed to write .env:", err);
    return false;
  }
}

export function maskApiKey(key: string | undefined | null): string {
  if (!key || !key.trim()) return ""; // 空/未配置返回空，由 UI 显示「未配置」
  if (key.length < 8) return "****";
  return `${key.slice(0, 3)}****${key.slice(-3)}`;
}

export function decodeBase64ApiKey(encoded: string): string {
  try {
    return Buffer.from(encoded, "base64").toString("utf-8");
  } catch {
    return encoded;
  }
}
