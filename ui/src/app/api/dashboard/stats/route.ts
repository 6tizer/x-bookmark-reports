/**
 * GET /api/dashboard/stats
 * CONTRACT v1.0 — reads from filesystem when DB is empty
 */

import { NextResponse } from "next/server";
import { getDb, isDbEmpty } from "@/lib/db";
import {
  getDashboardStats as getFsDashboardStats,
  getPipelineStatus,
} from "@/lib/fs-data";
import type { ApiResponse, DashboardStats, DashboardPipelineThree } from "@/types/api";

function emptyPipeline(): DashboardPipelineThree {
  return {
    twitterSync: { status: "pending" },
    deepReports: { status: "pending" },
    notionUpload: { status: "pending" },
  };
}

export async function GET(): Promise<NextResponse<ApiResponse<DashboardStats>>> {
  try {
    if (isDbEmpty()) {
      const fsStats = getFsDashboardStats();
      const pipeline = getPipelineStatus();

      const stats: DashboardStats = {
        lastSyncAt: fsStats.lastSync,
        totalDrafts: fsStats.totalDrafts,
        totalBookmarks: fsStats.totalDrafts,
        newThisWeek: fsStats.newThisWeek,
        articlesHermes: fsStats.totalArticles,
        notionUploaded: fsStats.notionUploaded,
        pendingRewrite: fsStats.pendingRewrite,
        pendingCount: fsStats.pendingRewrite,
        reportCount: fsStats.totalArticles,
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

    const pendingCount = Number(
      (
        db
          .prepare("SELECT COUNT(*) as c FROM bookmarks WHERE status = 'synced'")
          .get() as { c: number }
      ).c
    );

    const reportCount = Number(
      (db.prepare("SELECT COUNT(*) as c FROM reports").get() as { c: number }).c
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

    const lastReportJob = db
      .prepare("SELECT * FROM activities WHERE type = 'report' ORDER BY timestamp DESC LIMIT 1")
      .get() as Record<string, unknown> | undefined;

    const lastArticleJob = db
      .prepare("SELECT * FROM activities WHERE type = 'article' ORDER BY timestamp DESC LIMIT 1")
      .get() as Record<string, unknown> | undefined;

    const syncSt = lastSyncJob ? String(lastSyncJob.status) : "";
    const pipeline: DashboardPipelineThree = {
      twitterSync: !lastSyncJob
        ? { status: "pending" }
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
      deepReports: lastReportJob
        ? { status: "completed", lastRun: String(lastReportJob.timestamp) }
        : { status: "pending" },
      notionUpload: lastArticleJob
        ? { status: "completed", lastRun: String(lastArticleJob.timestamp) }
        : { status: "pending" },
    };

    const pendingRewrite = Math.max(0, totalBookmarks - totalArticles);

    const stats: DashboardStats = {
      lastSyncAt,
      totalDrafts: totalBookmarks,
      totalBookmarks,
      newThisWeek,
      articlesHermes: totalArticles,
      notionUploaded: 0,
      pendingRewrite,
      pendingCount,
      reportCount,
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
          articlesHermes: 0,
          notionUploaded: 0,
          pendingRewrite: 0,
          pendingCount: 0,
          reportCount: 0,
          pipeline: emptyPipeline(),
        },
        error: { code: "INTERNAL_ERROR", message, detail: String(err) },
      },
      { status: 500 }
    );
  }
}
