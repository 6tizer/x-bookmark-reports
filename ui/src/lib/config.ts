/**
 * Config Service — .env management (repo root)
 * Reads/writes all settings from the project root .env file.
 */

import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { getRepoRoot } from "@/lib/repo-root";

const ENV_PATH = path.join(getRepoRoot(), ".env");

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
  EXA_API_KEY?: string;
  EXA_BASE_URL?: string;
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
] as const;

function readEnvFile(): RawEnvConfig {
  if (!fs.existsSync(ENV_PATH)) {
    return {};
  }
  const parsed = dotenv.parse(fs.readFileSync(ENV_PATH, "utf-8"));
  return parsed as RawEnvConfig;
}

function writeEnvFile(config: RawEnvConfig): void {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(config)) {
    if (value !== undefined && value !== null) {
      lines.push(`${key}="${value.replace(/"/g, '\\"')}"`);
    }
  }
  fs.writeFileSync(ENV_PATH, lines.join("\n") + "\n", "utf-8");
}

export function loadEnv(): RawEnvConfig {
  dotenv.config({ path: ENV_PATH });
  return readEnvFile();
}

export function getEnvValue(key: keyof RawEnvConfig): string | undefined {
  const env = readEnvFile();
  return env[key];
}

export function updateEnv(updates: Partial<RawEnvConfig>): boolean {
  try {
    const current = readEnvFile();
    const merged = { ...current, ...updates };
    writeEnvFile(merged);
    return true;
  } catch (err) {
    console.error("Failed to write .env:", err);
    return false;
  }
}

export function maskApiKey(key: string | undefined | null): string {
  if (!key || key.length < 8) return "****";
  return `${key.slice(0, 3)}****${key.slice(-3)}`;
}

export function decodeBase64ApiKey(encoded: string): string {
  try {
    return Buffer.from(encoded, "base64").toString("utf-8");
  } catch {
    return encoded;
  }
}
