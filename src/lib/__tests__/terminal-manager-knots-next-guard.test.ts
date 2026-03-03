import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nextKnotMock = vi.fn();

const backend = {
  get: vi.fn(),
  list: vi.fn(),
  listWorkflows: vi.fn(),
  buildTakePrompt: vi.fn(),
};

const interactionLog = {
  filePath: undefined as string | undefined,
  logPrompt: vi.fn(),
  logStdout: vi.fn(),
  logStderr: vi.fn(),
  logResponse: vi.fn(),
  logBeatState: vi.fn(),
  logEnd: vi.fn(),
};

vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      stdin: { writable: boolean; write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
      kill: ReturnType<typeof vi.fn>;
      pid: number;
      killed?: boolean;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = {
      writable: true,
      write: vi.fn(() => true),
      end: vi.fn(),
    };
    child.kill = vi.fn(() => {
      child.killed = true;
      return true;
    });
    child.pid = 4321;
    return child;
  }),
}));

vi.mock("@/lib/backend-instance", () => ({
  getBackend: () => backend,
}));

vi.mock("@/lib/interaction-logger", () => ({
  startInteractionLog: vi.fn(async () => interactionLog),
  noopInteractionLog: vi.fn(() => interactionLog),
}));

vi.mock("@/lib/knots", () => ({
  nextKnot: (...args: unknown[]) => nextKnotMock(...args),
}));

vi.mock("@/lib/regroom", () => ({
  regroomAncestors: vi.fn(async () => undefined),
}));

vi.mock("@/lib/settings", () => ({
  getActionAgent: vi.fn(async () => ({ command: "codex", label: "Codex" })),
  getStepAgent: vi.fn(async () => ({ command: "codex", label: "Codex" })),
  loadSettings: vi.fn(async () => ({ dispatchMode: "single" })),
}));

vi.mock("@/lib/memory-manager-commands", async () => {
  const actual = await vi.importActual<typeof import("@/lib/memory-manager-commands")>(
    "@/lib/memory-manager-commands",
  );
  return {
    ...actual,
    resolveMemoryManagerType: vi.fn(() => "knots"),
  };
});

vi.mock("@/lib/validate-cwd", () => ({
  validateCwd: vi.fn(async () => null),
}));

vi.mock("@/lib/verification-orchestrator", () => ({
  onAgentComplete: vi.fn(async () => undefined),
}));

vi.mock("@/lib/agent-message-type-index", () => ({
  updateMessageTypeIndexFromSession: vi.fn(async () => undefined),
}));

import { createSession } from "@/lib/terminal-manager";

describe("terminal-manager nextKnot expected-state guard", () => {
  beforeEach(() => {
    nextKnotMock.mockReset();
    backend.get.mockReset();
    backend.list.mockReset();
    backend.listWorkflows.mockReset();
    backend.buildTakePrompt.mockReset();
    interactionLog.logPrompt.mockReset();
    interactionLog.logStdout.mockReset();
    interactionLog.logStderr.mockReset();
    interactionLog.logResponse.mockReset();
    interactionLog.logBeatState.mockReset();
    interactionLog.logEnd.mockReset();

    const sessions = (globalThis as { __terminalSessions?: Map<string, unknown> }).__terminalSessions;
    sessions?.clear();
  });

  afterEach(() => {
    const sessions = (globalThis as { __terminalSessions?: Map<string, unknown> }).__terminalSessions;
    sessions?.clear();
  });

  it("uses expected-state when healing active knots and tolerates stale mismatches", async () => {
    backend.get
      .mockResolvedValueOnce({
        ok: true,
        data: {
          id: "foolery-e6d4",
          title: "Fix double kno-next",
          state: "implementation",
          isAgentClaimable: false,
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          id: "foolery-e6d4",
          title: "Fix double kno-next",
          state: "ready_for_implementation_review",
          isAgentClaimable: true,
        },
      });

    backend.listWorkflows.mockResolvedValue({ ok: true, data: [] });
    backend.list.mockResolvedValue({ ok: true, data: [] });

    nextKnotMock.mockResolvedValue({
      ok: false,
      error: "expected state 'implementation' but knot is currently 'ready_for_implementation_review'",
    });

    await createSession("foolery-e6d4", "/tmp/repo", "custom prompt");

    expect(nextKnotMock).toHaveBeenCalledTimes(1);
    expect(nextKnotMock).toHaveBeenCalledWith("foolery-e6d4", "/tmp/repo", {
      actorKind: "agent",
      expectedState: "implementation",
    });
    expect(backend.get).toHaveBeenCalledTimes(2);
  });
});
