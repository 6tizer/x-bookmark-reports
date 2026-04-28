/**
 * GET /api/sync/[jobId]/stream
 * SSE — Real-time sync progress
 * CONTRACT v1.0
 */

import { subscribeToSyncJob } from "@/lib/sync-service";
// SSE types not needed at runtime — using inline Record types

interface RouteParams {
  params: { jobId: string };
}

export async function GET(
  _request: Request,
  { params }: RouteParams
): Promise<Response> {
  const { jobId } = params;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: Record<string, unknown>): void => {
        const payload = JSON.stringify(data);
        const message = `event: ${event}\ndata: ${payload}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      // Send initial heartbeat
      send("progress", {
        type: "progress",
        payload: { percent: 0, stage: "auth", logs: ["SSE connection established"], newCount: 0, totalCount: 0 },
      });

      const unsubscribe = subscribeToSyncJob(jobId, (evt) => {
        send(evt.type, { type: evt.type, payload: evt.payload });

        if (evt.type === "complete" || evt.type === "error") {
          // Give a moment for the client to receive, then close
          setTimeout(() => {
            try {
              controller.close();
            } catch {
              // already closed
            }
          }, 500);
        }
      });

      if (!unsubscribe) {
        // Job not active — send complete mock or error
        send("complete", {
          type: "complete",
          payload: { newCount: 0, totalCount: 0, completedAt: new Date().toISOString() },
        });
        setTimeout(() => controller.close(), 500);
        return;
      }

      // Timeout after 5 minutes to prevent hanging connections
      const timeout = setTimeout(() => {
        send("error", {
          type: "error",
          payload: { code: "INTERNAL_ERROR", message: "SSE connection timeout" },
        });
        controller.close();
      }, 5 * 60 * 1000);

      // Clean up on close
      const cleanup = () => {
        clearTimeout(timeout);
        unsubscribe();
      };

      // When client disconnects
      _request.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // ignore
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
