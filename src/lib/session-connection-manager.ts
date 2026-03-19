import { connectToSession } from "./terminal-api";
import { invalidateBeatListQueries } from "./beat-query-cache";
import { useTerminalStore } from "@/stores/terminal-store";
import { useNotificationStore } from "@/stores/notification-store";
import type { TerminalEvent } from "./types";
import type { QueryClient } from "@tanstack/react-query";

export interface BufferedEvent {
  type: TerminalEvent["type"];
  data: string;
}

type EventListener = (event: TerminalEvent) => void;

interface Connection {
  close: () => void;
  listeners: Set<EventListener>;
  buffer: BufferedEvent[];
  exitReceived: boolean;
  exitCode: number | null;
  /** Number of server-replayed events to skip (set during reconnection). */
  replaySkip: number;
}

const MAX_BUFFER = 5_000;

/**
 * Maximum number of times the manager will try to re-establish a dropped
 * connection for the same session before giving up entirely.
 */
const MAX_MANAGER_RECONNECTS = 3;

class SessionConnectionManager {
  private connections = new Map<string, Connection>();
  private reconnectCounts = new Map<string, number>();
  private storeUnsubscribe: (() => void) | null = null;
  private queryClientRef: QueryClient | null = null;

  /** Idempotent — creates SSE connection if not already connected. */
  connect(sessionId: string): void {
    if (this.connections.has(sessionId)) return;

    const conn: Connection = {
      close: () => {},
      listeners: new Set(),
      buffer: [],
      exitReceived: false,
      exitCode: null,
      replaySkip: 0,
    };
    this.connections.set(sessionId, conn);

    const close = connectToSession(
      sessionId,
      (event: TerminalEvent) => {
        // Successful event receipt — reset the reconnect counter so
        // transient blips don't permanently exhaust the budget.
        this.reconnectCounts.delete(sessionId);

        // On reconnection the server replays its entire event buffer.
        // Skip the replayed portion so listeners don't see duplicates,
        // but still add the events to our buffer (they fill the gap for
        // any events that arrived while disconnected).
        const isReplay = conn.replaySkip > 0;
        if (isReplay) conn.replaySkip--;

        // Buffer the event (bounded)
        if (conn.buffer.length < MAX_BUFFER) {
          conn.buffer.push({ type: event.type, data: event.data });
        }

        // Only forward genuinely new events to listeners.
        if (!isReplay) {
          for (const listener of conn.listeners) {
            listener(event);
          }
        }

        if (event.type === "agent_switch") {
          try {
            const agent = JSON.parse(event.data);
            useTerminalStore.getState().updateAgent(sessionId, agent);
          } catch {
            // ignore malformed agent_switch data
          }
          return;
        }

        if (event.type === "exit") {
          // Exit is terminal; ignore duplicate exit events from reconnect/replay.
          if (conn.exitReceived) return;
          conn.exitReceived = true;
          conn.exitCode = parseInt(event.data, 10);

          // Sentinel -2 means the session vanished from the backend
          // (server crash / restart) — NOT a clean completion.
          const isDisconnect = conn.exitCode === -2;

          // If the store already shows "aborted" (set by the terminate
          // action), preserve that status instead of overwriting it with
          // completed/error derived from the exit code.
          const currentTerminal = useTerminalStore
            .getState()
            .terminals.find((t) => t.sessionId === sessionId);
          const alreadyAborted = currentTerminal?.status === "aborted";

          // Update zustand store directly — outside React lifecycle
          if (!alreadyAborted) {
            useTerminalStore
              .getState()
              .updateStatus(
                sessionId,
                isDisconnect
                  ? "disconnected"
                  : conn.exitCode === 0
                    ? "completed"
                    : "error",
              );
          }

          // Fire in-app notification for session exit
          const terminal = currentTerminal ?? useTerminalStore
            .getState()
            .terminals.find((t) => t.sessionId === sessionId);
          if (terminal) {
            const { addNotification } = useNotificationStore.getState();
            const status = alreadyAborted
              ? "terminated"
              : isDisconnect
                ? "disconnected (server may have restarted)"
                : conn.exitCode === 0
                  ? "completed"
                  : "exited with error";

            // Extract last stderr content for error context
            let errorDetail = "";
            if (conn.exitCode !== 0 && !isDisconnect) {
              const stderrEvents = conn.buffer.filter((e) => e.type === "stderr");
              const lastStderr = stderrEvents
                .slice(-3)
                .map((e) => e.data.trim())
                .filter(Boolean)
                .join(" ")
                .slice(0, 200);
              if (lastStderr) {
                errorDetail = ` — ${lastStderr}`;
              } else {
                errorDetail = ` (exit code ${conn.exitCode}, no error output captured)`;
              }
            }

            addNotification({
              message: `"${terminal.beatTitle}" session ${status}${errorDetail}`,
              beatId: terminal.beatId,
              repoPath: terminal.repoPath,
            });
          }

          // Invalidate beat queries on success (not on disconnect)
          if (conn.exitCode === 0 && !isDisconnect && this.queryClientRef) {
            void invalidateBeatListQueries(this.queryClientRef);
          }
        }
      },
      // onError — the EventSource gave up.  Save the old connection's
      // listeners and buffer size, then tear down and reconnect.
      () => {
        const oldConn = this.connections.get(sessionId);
        const savedListeners = oldConn ? new Set(oldConn.listeners) : new Set<EventListener>();
        const replaySkip = oldConn ? oldConn.buffer.length : 0;
        this.connections.delete(sessionId);
        this.reconnect(sessionId, savedListeners, replaySkip);
      },
    );

    conn.close = close;
  }

  /** Close SSE and remove connection entry. */
  disconnect(sessionId: string): void {
    const conn = this.connections.get(sessionId);
    if (!conn) return;
    conn.close();
    this.connections.delete(sessionId);
    this.reconnectCounts.delete(sessionId);
  }

  /**
   * Re-establish a dropped SSE connection for a still-running session.
   * Transfers listeners from the old connection and sets `replaySkip`
   * so the server's buffered-event replay doesn't duplicate UI output.
   * Guards against infinite loops with a per-session retry counter.
   */
  private reconnect(
    sessionId: string,
    savedListeners: Set<EventListener>,
    replaySkip: number,
  ): void {
    // Only reconnect if the session is still marked as running in the store.
    const terminal = useTerminalStore
      .getState()
      .terminals.find((t) => t.sessionId === sessionId);
    if (!terminal || terminal.status !== "running") return;

    const attempts = this.reconnectCounts.get(sessionId) ?? 0;
    if (attempts >= MAX_MANAGER_RECONNECTS) {
      console.warn(
        `[session-connection-manager] [${sessionId}] giving up after ${attempts} reconnection attempts`,
      );
      return;
    }
    this.reconnectCounts.set(sessionId, attempts + 1);

    console.log(
      `[session-connection-manager] [${sessionId}] reconnecting (manager attempt ${attempts + 1}/${MAX_MANAGER_RECONNECTS})`,
    );
    // connect() is idempotent — it only creates a new connection when the
    // entry doesn't exist (the onError callback already deleted it).
    this.connect(sessionId);

    // Transfer state from the old connection to the new one.
    const newConn = this.connections.get(sessionId);
    if (newConn) {
      for (const listener of savedListeners) {
        newConn.listeners.add(listener);
      }
      newConn.replaySkip = replaySkip;
    }
  }

  /**
   * Subscribe to live events for a session.
   * Returns an unsubscribe function.
   *
   * The unsubscribe function looks up the *current* connection at call
   * time rather than capturing the connection at subscribe time, so it
   * still works correctly after a reconnect replaces the Connection.
   */
  subscribe(sessionId: string, listener: EventListener): () => void {
    const conn = this.connections.get(sessionId);
    if (!conn) return () => {};
    conn.listeners.add(listener);
    return () => {
      const current = this.connections.get(sessionId);
      if (current) current.listeners.delete(listener);
    };
  }

  /** Return buffered events for replay in xterm. */
  getBuffer(sessionId: string): BufferedEvent[] {
    return this.connections.get(sessionId)?.buffer ?? [];
  }

  /** Whether the session has received an exit event. */
  hasExited(sessionId: string): boolean {
    return this.connections.get(sessionId)?.exitReceived ?? false;
  }

  /** Get the exit code, or null if not yet exited. */
  getExitCode(sessionId: string): number | null {
    return this.connections.get(sessionId)?.exitCode ?? null;
  }

  /** List all currently-connected session IDs. */
  getConnectedIds(): string[] {
    return [...this.connections.keys()];
  }

  /**
   * Start syncing SSE connections with the terminal store.
   * Subscribes to zustand outside React — connections persist regardless
   * of which component is mounted or which tab is active.
   */
  startSync(queryClient: QueryClient): void {
    this.queryClientRef = queryClient;

    // Don't double-subscribe
    if (this.storeUnsubscribe) return;

    // Sync immediately for current state
    this.syncConnections();

    // Subscribe to future changes
    this.storeUnsubscribe = useTerminalStore.subscribe(() => {
      this.syncConnections();
    });
  }

  /** Stop syncing and disconnect all. */
  stopSync(): void {
    this.storeUnsubscribe?.();
    this.storeUnsubscribe = null;
    for (const sessionId of [...this.connections.keys()]) {
      this.disconnect(sessionId);
    }
  }

  private syncConnections(): void {
    const { terminals } = useTerminalStore.getState();
    const runningIds = new Set(
      terminals
        .filter((t) => t.status === "running")
        .map((t) => t.sessionId),
    );

    // Connect to new running sessions
    for (const sessionId of runningIds) {
      this.connect(sessionId);
    }

    // Disconnect sessions no longer running in the store
    for (const sessionId of this.connections.keys()) {
      if (!runningIds.has(sessionId)) {
        // Only disconnect if exit was already received — otherwise
        // keep the connection alive so we don't miss the exit event.
        const conn = this.connections.get(sessionId);
        if (conn?.exitReceived) {
          this.disconnect(sessionId);
        }
      }
    }
  }
}

/** Singleton instance */
export const sessionConnections = new SessionConnectionManager();
