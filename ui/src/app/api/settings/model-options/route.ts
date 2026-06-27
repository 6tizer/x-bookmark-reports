/**
 * GET /api/settings/model-options
 * 从 .env 读取当前模型配置，返回静态白名单 + env 标注的模型下拉选项。
 */

import * as fs from "fs";
import * as path from "path";
import { NextResponse } from "next/server";
import { getRepoRoot } from "@/lib/repo-root";
import type { ApiResponse } from "@/types/api";

export const dynamic = "force-dynamic";

/** 模型选项条目 */
interface ModelOption {
  value: string;
  label: string;
}

/** API 响应数据结构 */
interface ModelOptionsData {
  current: {
    deepseek: string;
    xai: string;
  };
  options: ModelOption[];
}

// ── 静态白名单（DeepSeek / xAI 已知模型） ──

const DEEPSEEK_WHITELIST: ModelOption[] = [
  { value: "deepseek-chat", label: "DeepSeek Chat" },
  { value: "deepseek-reasoner", label: "DeepSeek Reasoner" },
];

const XAI_WHITELIST: ModelOption[] = [
  { value: "grok-4.3", label: "xAI Grok 4.3" },
  { value: "grok-4.3-mini", label: "xAI Grok 4.3 Mini" },
  // 保留旧值兼容
  { value: "grok-2-latest", label: "xAI Grok 2 Latest" },
];

const DEFAULT_DEEPSEEK = "deepseek-chat";
const DEFAULT_XAI = "grok-4.3";

// ── .env 解析（沿用 notion-stats.ts 的引号剥离逻辑） ──

function parseEnv(): { deepseekModel: string; xaiModel: string } | null {
  const envPath = path.join(getRepoRoot(), ".env");
  if (!fs.existsSync(envPath)) return null;
  try {
    const raw = fs.readFileSync(envPath, "utf-8");
    let deepseekModel = "";
    let xaiModel = "";
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const eqIdx = trimmed.indexOf("=");
      const key = trimmed.slice(0, eqIdx).trim();
      // 剥离首尾引号，避免 KEY="value" 把引号一并读入
      let val = trimmed.slice(eqIdx + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (key === "DEEPSEEK_MODEL") deepseekModel = val;
      if (key === "XAI_MODEL") xaiModel = val;
    }
    if (!deepseekModel && !xaiModel) return null;
    return {
      deepseekModel: deepseekModel || DEFAULT_DEEPSEEK,
      xaiModel: xaiModel || DEFAULT_XAI,
    };
  } catch {
    return null;
  }
}

/** 组装下拉选项：默认项 + DeepSeek 分组 + xAI 分组 */
function buildOptions(current: { deepseek: string; xai: string }): ModelOption[] {
  const options: ModelOption[] = [
    { value: "", label: `Default (env: ${current.deepseek})` },
  ];

  const deepseekValues = new Set(DEEPSEEK_WHITELIST.map((o) => o.value));
  // env 值不在白名单时，在 DeepSeek 分组顶部插入
  if (!deepseekValues.has(current.deepseek)) {
    options.push({ value: current.deepseek, label: `${current.deepseek} (env)` });
  }
  options.push(...DEEPSEEK_WHITELIST);

  const xaiValues = new Set(XAI_WHITELIST.map((o) => o.value));
  // env 值不在白名单时，在 xAI 分组顶部插入
  if (!xaiValues.has(current.xai)) {
    options.push({ value: current.xai, label: `${current.xai} (env)` });
  }
  // 白名单项：与 env 当前值匹配则追加 (env) 标注
  for (const item of XAI_WHITELIST) {
    options.push({
      value: item.value,
      label: item.value === current.xai ? `${item.label} (env)` : item.label,
    });
  }

  return options;
}

function buildModelOptionsData(): ModelOptionsData {
  const parsed = parseEnv();
  const current = {
    deepseek: parsed?.deepseekModel ?? DEFAULT_DEEPSEEK,
    xai: parsed?.xaiModel ?? DEFAULT_XAI,
  };
  return { current, options: buildOptions(current) };
}

export async function GET(): Promise<NextResponse<ApiResponse<ModelOptionsData>>> {
  try {
    const data = buildModelOptionsData();
    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        data: buildModelOptionsData(),
        error: { code: "INTERNAL_ERROR", message, detail: String(err) },
      },
      { status: 500 }
    );
  }
}
