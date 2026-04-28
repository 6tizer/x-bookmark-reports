/**
 * Config Service — .env.twitter management
 * CONTRACT v1.0
 */

import fs from "fs";
import path from "path";
import dotenv from "dotenv";

const UI_ROOT = path.resolve(process.cwd());
const ENV_PATH = path.join(UI_ROOT, "..", ".env.twitter");

export interface RawEnvConfig {
  API_KEY?: string;
  PROXY?: string;
  DATA_PATH?: string;
  AUTO_SYNC?: string;
  CRON_EXPRESSION?: string;
}

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
    console.error("Failed to write .env.twitter:", err);
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
