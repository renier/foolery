import type { TerminalSession, TerminalEvent, BdResult } from "./types";

const BASE = "/api/terminal";

export async function listSessions(): Promise<TerminalSession[]> {
  try {
    const res = await fetch(BASE);
    if (!res.ok) return [];
    const json = await res.json();
    return json.data ?? [];
  } catch {
    return [];
  }
}

export async function startSession(
  beatId: string,
  repo?: string,
  prompt?: string
): Promise<BdResult<TerminalSession>> {
  const body: Record<string, string> = { beatId };
  if (repo) body._repo = repo;
  if (prompt) body.prompt = prompt;

  const res = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) return { ok: false, error: json.error ?? "Failed to start session" };
  return { ok: true, data: json.data };
}

export async function abortSession(sessionId: string): Promise<BdResult<void>> {
  const res = await fetch(BASE, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
  const json = await res.json();
  if (!res.ok) return { ok: false, error: json.error ?? "Failed to abort session" };
  return { ok: true };
}

async function fetchSessionStatus(
  sessionId: string,
): Promise<TerminalSession | null> {
  try {
    const sessions = await listSessions();
    return sessions.find((s) => s.id === sessionId) ?? null;
  } catch {
    return null;
  }
}

/**
 * Maximum number of consecutive reconnection attempts before giving up.
 * EventSource auto-reconnects on transient errors; we allow up to this
 * many retries before treating the connection as permanently failed.
 */
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_RESET_MS = 30_000;

export function connectToSession(
  sessionId: string,
  onEvent: (event: TerminalEvent) => void,
  onError?: (error: Event) => void,
): () => void {
  const es = new EventSource(`${BASE}/${sessionId}`);
  let gotExit = false;
  let gotStreamEnd = false;
  let reconnectAttempts = 0;
  let lastErrorTs = 0;

  es.onmessage = (msg) => {
    try {
      const event = JSON.parse(msg.data) as TerminalEvent;
      if (event.type === "exit") gotExit = true;
      // Server sends stream_end right before a clean close; swallow it.
      if (event.type === "stream_end") {
        gotStreamEnd = true;
        return;
      }
      onEvent(event);
      // Successful message receipt — reset the reconnect counter so
      // transient blips don't accumulate across long-running sessions.
      reconnectAttempts = 0;
    } catch {
      // ignore parse errors
    }
  };

  es.onerror = (err) => {
    // Stream closing after exit or clean server shutdown is not an error.
    if (gotExit || gotStreamEnd) {
      es.close();
      return;
    }

    // Track consecutive errors.  Reset the counter if enough time has
    // passed since the last error (the connection was healthy in between).
    const now = Date.now();
    if (now - lastErrorTs > RECONNECT_RESET_MS) {
      reconnectAttempts = 0;
    }
    lastErrorTs = now;
    reconnectAttempts++;

    // If EventSource is CONNECTING (readyState 0), the browser is already
    // trying to reconnect automatically.  Let it — unless we've exceeded
    // the retry budget.
    if (es.readyState === EventSource.CONNECTING && reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) {
      console.log(
        `[terminal-sse-client] [${sessionId}] reconnecting (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`,
      );
      return; // let the browser's built-in reconnect proceed
    }

    // Defer briefly so any pending onmessage (exit) can run first.
    // EventSource fires queued messages before onerror, but a server-
    // initiated close can race with the last data frame at the TCP level.
    setTimeout(async () => {
      if (gotExit || gotStreamEnd) {
        es.close();
        return;
      }
      // Poll backend to recover from missed exit events
      const session = await fetchSessionStatus(sessionId);
      if (
        session &&
        (session.status === "completed" || session.status === "error")
      ) {
        onEvent({
          type: "exit",
          data: String(session.exitCode ?? 0),
          timestamp: Date.now(),
        });
      } else if (!session) {
        // Session gone from backend — server likely restarted/crashed.
        // Use sentinel exit code -2 so callers can distinguish from clean exit.
        onEvent({ type: "exit", data: "-2", timestamp: Date.now() });
      } else {
        // Session is still running — signal the connection manager so it
        // can tear down this stale entry and establish a fresh connection.
        onError?.(err);
      }
      es.close();
    }, 200);
  };

  return () => es.close();
}
