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

/** 组装下拉选项：默认项 + DeepSeek 分组（Run dropdown 仅暴露 DeepSeek，xAI 走 LLMSettings） */
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

  // 注意：xAI 模型不再出现在 Run 下拉里——它们会传给 --model → DeepSeek 客户端，
  // 导致 "model not found"（B-PIPELINE-MODEL-CROSS-PROVIDER）。
  // xAI 模型仅通过 LLMSettings 的 xAI Model 输入框 → .env XAI_MODEL 配置。

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
