import { NextRequest } from "next/server";
import { getBreakdownSession } from "@/lib/breakdown-manager";
import type { BreakdownEvent } from "@/lib/types";

const HEARTBEAT_INTERVAL_MS = 15_000;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const entry = getBreakdownSession(sessionId);

  if (!entry) {
    return new Response(JSON.stringify({ error: "Session not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;

      const send = (event: BreakdownEvent) => {
        if (closed) return;
        try {
          const payload = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch (err) {
          console.warn(`[breakdown-sse] [${sessionId}] enqueue failed, closing stream:`, err);
          closeStream();
        }
      };

      const cleanup = () => {
        entry.emitter.off("data", listener);
        clearInterval(heartbeatTimer);
      };

      const closeStream = () => {
        if (closed) return;
        closed = true;
        cleanup();
        try {
          controller.close();
        } catch {
          // noop
        }
      };

      for (const event of entry.buffer) {
        send(event);
      }

      const listener = (event: BreakdownEvent) => {
        send(event);
        if (event.type === "exit") {
          setTimeout(closeStream, 100);
        }
      };

      entry.emitter.on("data", listener);

      // Heartbeat: send an SSE comment periodically to keep the
      // connection alive during quiet periods.
      const heartbeatTimer = setInterval(() => {
        if (closed) { clearInterval(heartbeatTimer); return; }
        try {
          controller.enqueue(encoder.encode(`:keepalive\n\n`));
        } catch {
          closeStream();
        }
      }, HEARTBEAT_INTERVAL_MS);

      if (entry.session.status !== "running") {
        const hasExit = entry.buffer.some((event) => event.type === "exit");
        if (hasExit) setTimeout(closeStream, 200);
      }

      request.signal.addEventListener("abort", () => {
        closeStream();
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
