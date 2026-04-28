/**
 * GET /api/dashboard/stats
 * CONTRACT v1.0 — reads from filesystem when DB is empty
 */

import { NextResponse } from "next/server";
import { getDb, isDbEmpty } from "@/lib/db";
import { getDashboardStats as getFsDashboardStats } from "@/lib/fs-data";
import type { ApiResponse, DashboardStats } from "@/types/api";

export async function GET(): Promise<NextResponse<ApiResponse<DashboardStats>>> {
  try {
    if (isDbEmpty()) {
      // Read from filesystem
      const fsStats = getFsDashboardStats();

      // Count articles from bookmark-articles dir
      const articles = fsStats.totalArticles;

      const stats: DashboardStats = {
        lastSyncAt: new Date().toISOString(),
        totalBookmarks: fsStats.totalDrafts,
        newThisWeek: fsStats.totalDrafts, // All drafts are "new" from filesystem perspective
        pendingCount: Math.max(0, fsStats.totalDrafts - articles),
        reportCount: articles,
        pipeline: {
          sync: { status: "completed", lastRun: new Date().toISOString() },
          read: { status: "completed", lastRun: new Date().toISOString() },
          report: { status: "completed", lastRun: new Date().toISOString() },
          article: { status: "completed", lastRun: new Date().toISOString() },
        },
      };

      return NextResponse.json({ success: true, data: stats });
    }

    const db = getDb();

    const totalBookmarks = Number(
      (db.prepare("SELECT COUNT(*) as c FROM bookmarks").get() as { c: number }).c
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
      .prepare("SELECT completed_at FROM sync_jobs WHERE status = 'completed' ORDER BY completed_at DESC LIMIT 1")
      .get() as { completed_at: string } | undefined;
    const lastSyncAt = lastSyncRow?.completed_at ?? null;

    const lastSyncJob = db
      .prepare("SELECT * FROM sync_jobs ORDER BY started_at DESC LIMIT 1")
      .get() as Record<string, unknown> | undefined;

    const lastReadJob = db
      .prepare("SELECT * FROM activities WHERE type = 'read' ORDER BY timestamp DESC LIMIT 1")
      .get() as Record<string, unknown> | undefined;

    const lastReportJob = db
      .prepare("SELECT * FROM activities WHERE type = 'report' ORDER BY timestamp DESC LIMIT 1")
      .get() as Record<string, unknown> | undefined;

    const lastArticleJob = db
      .prepare("SELECT * FROM activities WHERE type = 'article' ORDER BY timestamp DESC LIMIT 1")
      .get() as Record<string, unknown> | undefined;

    const pipeline: DashboardStats["pipeline"] = {
      sync: {
        status: lastSyncJob
          ? (String(lastSyncJob.status) as DashboardStats["pipeline"]["sync"]["status"])
          : "pending",
        lastRun: lastSyncJob ? String(lastSyncJob.started_at) : undefined,
      },
      read: {
        status: lastReadJob ? "completed" : "pending",
        lastRun: lastReadJob ? String(lastReadJob.timestamp) : undefined,
      },
      report: {
        status: lastReportJob ? "completed" : "pending",
        lastRun: lastReportJob ? String(lastReportJob.timestamp) : undefined,
      },
      article: {
        status: lastArticleJob ? "completed" : "pending",
        lastRun: lastArticleJob ? String(lastArticleJob.timestamp) : undefined,
      },
    };

    if (lastSyncJob && String(lastSyncJob.status) === "running") {
      pipeline.sync.status = "running";
      pipeline.sync.progress = Number(lastSyncJob.progress);
    }

    const stats: DashboardStats = {
      lastSyncAt,
      totalBookmarks,
      newThisWeek,
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
          totalBookmarks: 0,
          newThisWeek: 0,
          pendingCount: 0,
          reportCount: 0,
          pipeline: {
            sync: { status: "pending" },
            read: { status: "pending" },
            report: { status: "pending" },
            article: { status: "pending" },
          },
        },
        error: { code: "INTERNAL_ERROR", message, detail: String(err) },
      },
      { status: 500 }
    );
  }
}
