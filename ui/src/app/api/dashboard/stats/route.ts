/**
 * GET /api/dashboard/stats
 * CONTRACT v2 — reads from filesystem when DB is empty, enriches with Notion DB stats
 */

import { NextResponse } from "next/server";
import { getDb, isDbEmpty } from "@/lib/db";
import {
  getDashboardStats as getFsDashboardStats,
  getPipelineStatus,
} from "@/lib/fs-data";
import { getNotionDbStats } from "@/lib/notion-stats";
import type { ApiResponse, DashboardStats, DashboardPipelineFour } from "@/types/api";

export const dynamic = "force-dynamic";

function emptyPipeline(): DashboardPipelineFour {
  const p = { status: "pending" as const };
  return {
    twitterSync: p,
    deepReports: p,
    rewrite: p,
    notionUpload: p,
  };
}

export async function GET(): Promise<NextResponse<ApiResponse<DashboardStats>>> {
  try {
    if (isDbEmpty()) {
      const fsStats = getFsDashboardStats();
      const pipeline = getPipelineStatus();

      // Enrich with Notion DB stats (with filesystem fallback)
      const notionStats = await getNotionDbStats();

      const stats: DashboardStats = {
        lastSyncAt: fsStats.lastSync,
        totalDrafts: fsStats.totalDrafts,
        totalBookmarks: fsStats.totalDrafts,
        newThisWeek: fsStats.newThisWeek,
        articlesWritten: notionStats?.articlesWritten ?? fsStats.totalArticles,
        notionTotalUploaded: notionStats?.totalRecords ?? fsStats.notionFinishedUploaded,
        pendingRewrite: notionStats?.pendingRewrite ?? fsStats.pendingRewrite,
        // Stage 2 之前临时补 0，真实逻辑留 Stage 2
        totalArticlesLocal: 0,
        totalArticlesNotion: 0,
        pendingRewriteLocal: 0,
        pendingRewriteGlobal: 0,
        pipeline,
      };

      return NextResponse.json({ success: true, data: stats });
    }

    const db = getDb();

    const totalBookmarks = Number(
      (db.prepare("SELECT COUNT(*) as c FROM bookmarks").get() as { c: number }).c
    );

    const totalArticles = Number(
      (db.prepare("SELECT COUNT(*) as c FROM articles").get() as { c: number }).c
    );

    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const newThisWeek = Number(
      (
        db
          .prepare("SELECT COUNT(*) as c FROM bookmarks WHERE bookmarked_at > ?")
          .get(oneWeekAgo) as { c: number }
      ).c
    );

    const lastSyncRow = db
      .prepare(
        "SELECT completed_at FROM sync_jobs WHERE status = 'completed' ORDER BY completed_at DESC LIMIT 1"
      )
      .get() as { completed_at: string } | undefined;
    const lastSyncAt = lastSyncRow?.completed_at ?? null;

    const lastSyncJob = db
      .prepare("SELECT * FROM sync_jobs ORDER BY started_at DESC LIMIT 1")
      .get() as Record<string, unknown> | undefined;

    const lastArticleJob = db
      .prepare("SELECT * FROM activities WHERE type = 'article' ORDER BY timestamp DESC LIMIT 1")
      .get() as Record<string, unknown> | undefined;

    const syncSt = lastSyncJob ? String(lastSyncJob.status) : "";
    const pendingNode = { status: "pending" as const };

    const pipeline: DashboardPipelineFour = {
      twitterSync: !lastSyncJob
        ? pendingNode
        : syncSt === "running"
          ? {
              status: "running",
              lastRun: String(lastSyncJob.started_at),
              progress: Number(lastSyncJob.progress) || undefined,
            }
          : syncSt === "failed"
            ? {
                status: "failed",
                lastRun: String(lastSyncJob.started_at),
                error: {
                  code: "SYNC_FAILED",
                  message: String(
                    (lastSyncJob.error as { message?: string })?.message ?? "Sync failed"
                  ),
                },
              }
            : { status: "completed", lastRun: String(lastSyncJob.started_at) },
      deepReports: lastArticleJob
        ? { status: "completed", lastRun: String(lastArticleJob.timestamp) }
        : pendingNode,
      rewrite: lastArticleJob
        ? { status: "completed", lastRun: String(lastArticleJob.timestamp) }
        : pendingNode,
      notionUpload: lastArticleJob
        ? { status: "completed", lastRun: String(lastArticleJob.timestamp) }
        : pendingNode,
    };

    const pendingRewrite = Math.max(0, totalBookmarks - totalArticles);

    const stats: DashboardStats = {
      lastSyncAt,
      totalDrafts: totalBookmarks,
      totalBookmarks,
      newThisWeek,
      articlesWritten: totalArticles,
      notionTotalUploaded: 0,
      pendingRewrite,
      // Stage 2 之前临时补 0，真实逻辑留 Stage 2
      totalArticlesLocal: 0,
      totalArticlesNotion: 0,
      pendingRewriteLocal: 0,
      pendingRewriteGlobal: 0,
      pipeline,
    };

    return NextResponse.json({ success: true, data: stats });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        data: {
          lastSyncAt: null,
          totalDrafts: 0,
          totalBookmarks: 0,
          newThisWeek: 0,
          articlesWritten: 0,
          notionTotalUploaded: 0,
          pendingRewrite: 0,
          // Stage 2 之前临时补 0，真实逻辑留 Stage 2
          totalArticlesLocal: 0,
          totalArticlesNotion: 0,
          pendingRewriteLocal: 0,
          pendingRewriteGlobal: 0,
          pipeline: emptyPipeline(),
        },
        error: { code: "INTERNAL_ERROR", message, detail: String(err) },
      },
      { status: 500 }
    );
  }
}
