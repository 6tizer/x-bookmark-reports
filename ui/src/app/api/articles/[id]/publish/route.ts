/**
 * POST /api/articles/[id]/publish
 * FS mode: spawns `bin/upload_to_notion.py --mode finished --file <article-final>`.
 */

import { NextResponse } from "next/server";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { isDbEmpty, publishArticle } from "@/lib/db";
import { getArticleFinalFilePath } from "@/lib/fs-data";
import { getRepoRoot } from "@/lib/repo-root";
import { getArticleById as getMockArticle } from "@/db/mock";
import { getLogger } from "@/lib/logger";
import type { ApiResponse, PublishRequest } from "@/types/api";

interface RouteParams {
  params: { id: string };
}

export interface ArticlePublishResult {
  url: string;
  pid?: number;
}

const logger = getLogger("agent");

function resolvePython(repoRoot: string): string {
  const venvPy = path.join(repoRoot, ".venv", "bin", "python3");
  if (fs.existsSync(venvPy)) return venvPy;
  return "python3";
}

export async function POST(
  request: Request,
  { params }: RouteParams
): Promise<NextResponse<ApiResponse<ArticlePublishResult>>> {
  try {
    const { id } = params;
    const body = (await request.json()) as PublishRequest;
    const format = body.format ?? "markdown";

    if (isDbEmpty()) {
      const finalPath = getArticleFinalFilePath(id);
      if (finalPath) {
        const repoRoot = getRepoRoot();
        const script = path.join(repoRoot, "bin", "upload_to_notion.py");
        if (!fs.existsSync(script)) {
          return NextResponse.json(
            {
              success: false,
              data: { url: "" },
              error: { code: "NOT_FOUND", message: "upload_to_notion.py not found" },
            },
            { status: 500 }
          );
        }
        const py = resolvePython(repoRoot);
        const relFile = path.relative(repoRoot, finalPath);
        const args = [script, "--mode", "finished", "--file", relFile];
        const child = spawn(py, args, {
          cwd: repoRoot,
          detached: true,
          stdio: "ignore",
          env: { ...process.env },
        });
        child.unref();
        logger.info(`Spawned Notion finished upload for ${id} pid=${child.pid}`);
        return NextResponse.json({
          success: true,
          data: {
            url: `/articles/${id}`,
            pid: child.pid,
          },
        });
      }

      const mock = getMockArticle(id);
      if (!mock) {
        return NextResponse.json(
          {
            success: false,
            data: { url: "" },
            error: {
              code: "ARTICLE_NOT_FOUND",
              message: "No article-final markdown for this id (and not in mock data)",
            },
          },
          { status: 404 }
        );
      }
      return NextResponse.json({
        success: true,
        data: {
          url: `/articles/${id}.${format === "wechat" ? "html" : format}`,
        },
      });
    }

    const article = publishArticle(id, format);
    if (!article) {
      return NextResponse.json(
        {
          success: false,
          data: { url: "" },
          error: { code: "ARTICLE_NOT_FOUND", message: "Article not found" },
        },
        { status: 404 }
      );
    }

    logger.info(`Published article ${id} in ${format} format (db)`);
    return NextResponse.json({
      success: true,
      data: { url: `/articles/${id}` },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        data: { url: "" },
        error: { code: "INTERNAL_ERROR", message, detail: String(err) },
      },
      { status: 200 }
    );
  }
}
