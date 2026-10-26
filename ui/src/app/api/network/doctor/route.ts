/**
 * GET  /api/network/doctor  读取当前网络档案（cache/network_profile.json）
 * POST /api/network/doctor  一键检测并修复：运行 bin/network_doctor.py --apply --all --json，
 *                           探测 .env 代理 / 上次可用 / 系统代理 / 本机常见代理端口 / 直连，
 *                           选出可用路径写入网络档案；auto_run.sh、sync_bookmarks.sh、Python 均以此为准
 */

import { NextResponse } from "next/server";
import { execFile } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { getRepoRoot } from "@/lib/repo-root";
import { createLog } from "@/lib/db";
import type { ApiResponse, NetworkProfile } from "@/types/api";

export const dynamic = "force-dynamic";

// 只接受 host:port 形式的 HTTP 代理，防止把任意参数塞给子进程
const PROXY_RE = /^(https?:\/\/)?[A-Za-z0-9.-]+:\d{1,5}\/?$/;

function profilePath(): string {
  return path.join(getRepoRoot(), "cache", "network_profile.json");
}

function readProfile(): NetworkProfile | null {
  try {
    const p = profilePath();
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf-8")) as NetworkProfile;
  } catch {
    return null;
  }
}

function runDoctor(proxy: string | null): Promise<NetworkProfile> {
  const repoRoot = getRepoRoot();
  const script = path.join(repoRoot, "bin", "network_doctor.py");
  // 与 auto_run.sh 一致用系统 python3（脚本只依赖标准库）
  const py = fs.existsSync("/usr/bin/python3") ? "/usr/bin/python3" : "python3";
  const args = [script, "--apply", "--all", "--json"];
  if (proxy) args.push("--proxy", proxy);

  return new Promise((resolve, reject) => {
    execFile(
      py,
      args,
      { cwd: repoRoot, timeout: 120_000, maxBuffer: 2 * 1024 * 1024 },
      (error, stdout, stderr) => {
        // 退出码 2 = offline，stdout 仍是完整 JSON
        try {
          resolve(JSON.parse(stdout) as NetworkProfile);
        } catch {
          reject(new Error(error?.message || stderr || "network_doctor.py 没有返回 JSON"));
        }
      }
    );
  });
}

export async function GET(): Promise<NextResponse<ApiResponse<NetworkProfile | null>>> {
  return NextResponse.json({ success: true, data: readProfile() });
}

export async function POST(request: Request): Promise<NextResponse<ApiResponse<NetworkProfile>>> {
  let proxy: string | null = null;
  try {
    const body = (await request.json().catch(() => ({}))) as { proxy?: string };
    const raw = (body.proxy || "").trim();
    if (raw) {
      if (!PROXY_RE.test(raw)) {
        return NextResponse.json(
          {
            success: false,
            data: null,
            error: { code: "INVALID_PROXY", message: "代理地址格式应为 http://主机:端口" },
          },
          { status: 400 }
        );
      }
      proxy = raw;
    }

    const profile = await runDoctor(proxy);
    const summary =
      profile.mode === "offline"
        ? "网络检测：直连和所有代理都不可用"
        : profile.mode === "direct"
          ? "网络检测：已切换为直连"
          : `网络检测：已切换为代理 ${profile.proxy}`;
    try {
      createLog("system", profile.mode === "offline" ? "error" : "info", summary, profile.hints.join("\n"));
    } catch {
      /* 日志写入失败不影响检测结果 */
    }
    return NextResponse.json({ success: true, data: profile });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: {
          code: "NETWORK_DOCTOR_FAILED",
          message: "网络检测失败",
          detail: err instanceof Error ? err.message : String(err),
        },
      },
      { status: 500 }
    );
  }
}
