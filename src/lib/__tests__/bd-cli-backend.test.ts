/**
 * Tests for BdCliBackend -- the adapter that delegates to bd CLI functions
 * and converts BdResult<T> into BackendResult<T>.
 *
 * Mocks the @/lib/bd module so no real CLI invocations occur.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BdResult, Beat, BeatDependency } from "@/lib/types";

// ---------------------------------------------------------------------------
// Mock bd module
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
const mockListBeats = vi.fn<(...args: any[]) => Promise<BdResult<Beat[]>>>();
const mockReadyBeats = vi.fn<(...args: any[]) => Promise<BdResult<Beat[]>>>();
const mockSearchBeats = vi.fn<(...args: any[]) => Promise<BdResult<Beat[]>>>();
const mockQueryBeats = vi.fn<(...args: any[]) => Promise<BdResult<Beat[]>>>();
const mockShowBeat = vi.fn<(...args: any[]) => Promise<BdResult<Beat>>>();
const mockCreateBeat = vi.fn<(...args: any[]) => Promise<BdResult<{ id: string }>>>();
const mockUpdateBeat = vi.fn<(...args: any[]) => Promise<BdResult<void>>>();
const mockDeleteBeat = vi.fn<(...args: any[]) => Promise<BdResult<void>>>();
const mockCloseBeat = vi.fn<(...args: any[]) => Promise<BdResult<void>>>();
const mockListDeps = vi.fn<(...args: any[]) => Promise<BdResult<BeatDependency[]>>>();
const mockAddDep = vi.fn<(...args: any[]) => Promise<BdResult<void>>>();
const mockRemoveDep = vi.fn<(...args: any[]) => Promise<BdResult<void>>>();
/* eslint-enable @typescript-eslint/no-explicit-any */

vi.mock("@/lib/bd", () => ({
  listBeats: (...args: unknown[]) => mockListBeats(...(args as [])),
  readyBeats: (...args: unknown[]) => mockReadyBeats(...(args as [])),
  searchBeats: (...args: unknown[]) => mockSearchBeats(...(args as [])),
  queryBeats: (...args: unknown[]) => mockQueryBeats(...(args as [])),
  showBeat: (...args: unknown[]) => mockShowBeat(...(args as [])),
  createBeat: (...args: unknown[]) => mockCreateBeat(...(args as [])),
  updateBeat: (...args: unknown[]) => mockUpdateBeat(...(args as [])),
  deleteBeat: (...args: unknown[]) => mockDeleteBeat(...(args as [])),
  closeBeat: (...args: unknown[]) => mockCloseBeat(...(args as [])),
  listDeps: (...args: unknown[]) => mockListDeps(...(args as [])),
  addDep: (...args: unknown[]) => mockAddDep(...(args as [])),
  removeDep: (...args: unknown[]) => mockRemoveDep(...(args as [])),
}));

// ---------------------------------------------------------------------------
// Import after mocking
// ---------------------------------------------------------------------------

import { BdCliBackend } from "@/lib/backends/bd-cli-backend";
import { FULL_CAPABILITIES } from "@/lib/backend-capabilities";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SAMPLE_BEAT: Beat = {
  id: "test-1",
  title: "Sample beat",
  type: "task",
  state: "open",
  workflowId: "autopilot",
  workflowMode: "granular_autonomous",
  profileId: "autopilot",
  priority: 2,
  labels: [],
  created: "2026-01-01T00:00:00Z",
  updated: "2026-01-02T00:00:00Z",
} as Beat;

const CLAIMABLE_BEAT: Beat = {
  id: "claimable-1",
  title: "Claimable beat",
  type: "task",
  state: "ready_for_planning",
  workflowId: "autopilot",
  workflowMode: "granular_autonomous",
  profileId: "autopilot",
  isAgentClaimable: true,
  priority: 2,
  labels: [],
  created: "2026-01-01T00:00:00Z",
  updated: "2026-01-02T00:00:00Z",
} as Beat;

const ACTIVE_BEAT: Beat = {
  id: "active-1",
  title: "Active beat",
  type: "task",
  state: "planning",
  workflowId: "autopilot",
  workflowMode: "granular_autonomous",
  profileId: "autopilot",
  isAgentClaimable: false,
  priority: 2,
  labels: [],
  created: "2026-01-01T00:00:00Z",
  updated: "2026-01-02T00:00:00Z",
} as Beat;

const SAMPLE_DEP: BeatDependency = {
  id: "dep-1",
  beat_id: "test-1",
  depends_on_id: "test-2",
  type: "blocks",
} as BeatDependency;

function resetAllMocks(): void {
  mockListBeats.mockReset();
  mockReadyBeats.mockReset();
  mockSearchBeats.mockReset();
  mockQueryBeats.mockReset();
  mockShowBeat.mockReset();
  mockCreateBeat.mockReset();
  mockUpdateBeat.mockReset();
  mockDeleteBeat.mockReset();
  mockCloseBeat.mockReset();
  mockListDeps.mockReset();
  mockAddDep.mockReset();
  mockRemoveDep.mockReset();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BdCliBackend", () => {
  let backend: BdCliBackend;

  beforeEach(() => {
    resetAllMocks();
    backend = new BdCliBackend();
  });

  // ── Capabilities ──────────────────────────────────────────

  it("exposes FULL_CAPABILITIES", () => {
    expect(backend.capabilities).toBe(FULL_CAPABILITIES);
  });

  // ── listWorkflows ─────────────────────────────────────────

  describe("listWorkflows", () => {
    it("returns builtin workflow descriptors", async () => {
      const result = await backend.listWorkflows();
      expect(result.ok).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect((result.data ?? []).length).toBeGreaterThan(0);
    });

    it("accepts optional repoPath without error", async () => {
      const result = await backend.listWorkflows("/some/path");
      expect(result.ok).toBe(true);
    });
  });

  // ── toBR success/error conversion ─────────────────────────

  describe("toBR (result conversion)", () => {
    it("converts ok BdResult to ok BackendResult", async () => {
      mockListBeats.mockResolvedValue({ ok: true, data: [SAMPLE_BEAT] });
      const result = await backend.list();
      expect(result.ok).toBe(true);
      expect(result.data).toEqual([SAMPLE_BEAT]);
      expect(result.error).toBeUndefined();
    });

    it("converts error BdResult with 'not found' to NOT_FOUND", async () => {
      mockShowBeat.mockResolvedValue({ ok: false, error: "Resource not found: test-1" });
      const result = await backend.get("test-1");
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("NOT_FOUND");
      expect(result.error?.retryable).toBe(false);
    });

    it("converts error BdResult with 'locked' to LOCKED", async () => {
      mockDeleteBeat.mockResolvedValue({ ok: false, error: "database is locked" });
      const result = await backend.delete("test-1");
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("LOCKED");
      expect(result.error?.retryable).toBe(true);
    });

    it("converts error BdResult with 'timed out' to TIMEOUT", async () => {
      mockUpdateBeat.mockResolvedValue({ ok: false, error: "Operation timed out" });
      const result = await backend.update("test-1", { title: "x" });
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("TIMEOUT");
      expect(result.error?.retryable).toBe(true);
    });

    it("converts error BdResult with 'permission denied' to PERMISSION_DENIED", async () => {
      mockCreateBeat.mockResolvedValue({ ok: false, error: "permission denied" });
      const result = await backend.create({ title: "x", type: "task", priority: 2, labels: [] });
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("PERMISSION_DENIED");
      expect(result.error?.retryable).toBe(false);
    });

    it("classifies unrecognized error as INTERNAL", async () => {
      mockCloseBeat.mockResolvedValue({ ok: false, error: "something unexpected happened" });
      const result = await backend.close("test-1");
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("INTERNAL");
    });

    it("uses 'Unknown error' when error string is undefined", async () => {
      mockListBeats.mockResolvedValue({ ok: false });
      const result = await backend.list();
      expect(result.ok).toBe(false);
      expect(result.error?.message).toBe("Unknown error");
    });

    it("converts 'already exists' to ALREADY_EXISTS", async () => {
      mockCreateBeat.mockResolvedValue({ ok: false, error: "Resource already exists: dup-1" });
      const result = await backend.create({ title: "dup", type: "task", priority: 2, labels: [] });
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("ALREADY_EXISTS");
    });

    it("converts 'unavailable' to UNAVAILABLE", async () => {
      mockListBeats.mockResolvedValue({ ok: false, error: "backend unavailable" });
      const result = await backend.list();
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("UNAVAILABLE");
      expect(result.error?.retryable).toBe(true);
    });
  });

  // ── filtersToRecord ───────────────────────────────────────

  describe("filtersToRecord (via list/listReady/search)", () => {
    it("passes undefined when no filters given", async () => {
      mockListBeats.mockResolvedValue({ ok: true, data: [] });
      await backend.list();
      expect(mockListBeats).toHaveBeenCalledWith(undefined, undefined);
    });

    it("converts typed filters to Record<string, string>", async () => {
      mockListBeats.mockResolvedValue({ ok: true, data: [] });
      await backend.list({ type: "bug", priority: 1 });
      const call = mockListBeats.mock.calls[0];
      expect(call[0]).toEqual({ type: "bug", priority: "1" });
    });

    it("omits null and undefined values from filters", async () => {
      mockReadyBeats.mockResolvedValue({ ok: true, data: [] });
      await backend.listReady({ type: "task", state: undefined });
      const call = mockReadyBeats.mock.calls[0];
      expect(call[0]).toEqual({ type: "task" });
    });

    it("returns undefined when all filter values are undefined/null", async () => {
      mockListBeats.mockResolvedValue({ ok: true, data: [] });
      await backend.list({ type: undefined, state: undefined });
      const call = mockListBeats.mock.calls[0];
      expect(call[0]).toBeUndefined();
    });
  });

  // ── CRUD delegation tests ─────────────────────────────────

  describe("list", () => {
    it("delegates to bd.listBeats with converted filters", async () => {
      mockListBeats.mockResolvedValue({ ok: true, data: [SAMPLE_BEAT] });
      const result = await backend.list({ type: "task" }, "/repo");
      expect(mockListBeats).toHaveBeenCalledWith({ type: "task" }, "/repo");
      expect(result.ok).toBe(true);
      expect(result.data).toEqual([SAMPLE_BEAT]);
    });
  });

  describe("listReady", () => {
    it("delegates to bd.readyBeats", async () => {
      mockReadyBeats.mockResolvedValue({ ok: true, data: [] });
      const result = await backend.listReady({ label: "urgent" }, "/repo");
      expect(mockReadyBeats).toHaveBeenCalledWith({ label: "urgent" }, "/repo");
      expect(result.ok).toBe(true);
    });
  });

  describe("search", () => {
    it("delegates to bd.searchBeats with query and filters", async () => {
      mockSearchBeats.mockResolvedValue({ ok: true, data: [SAMPLE_BEAT] });
      const result = await backend.search("login bug", { type: "bug" }, "/repo");
      expect(mockSearchBeats).toHaveBeenCalledWith("login bug", { type: "bug" }, "/repo");
      expect(result.ok).toBe(true);
    });

    it("handles search error", async () => {
      mockSearchBeats.mockResolvedValue({ ok: false, error: "bd search failed" });
      const result = await backend.search("query");
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("INTERNAL");
    });
  });

  describe("query", () => {
    it("delegates to bd.queryBeats", async () => {
      mockQueryBeats.mockResolvedValue({ ok: true, data: [] });
      const opts = { limit: 10, sort: "priority" };
      const result = await backend.query("priority < 3", opts, "/repo");
      expect(mockQueryBeats).toHaveBeenCalledWith("priority < 3", opts, "/repo");
      expect(result.ok).toBe(true);
    });
  });

  describe("get", () => {
    it("delegates to bd.showBeat", async () => {
      mockShowBeat.mockResolvedValue({ ok: true, data: SAMPLE_BEAT });
      const result = await backend.get("test-1", "/repo");
      expect(mockShowBeat).toHaveBeenCalledWith("test-1", "/repo");
      expect(result.ok).toBe(true);
      expect(result.data).toEqual(SAMPLE_BEAT);
    });
  });

  describe("create", () => {
    it("delegates to bd.createBeat", async () => {
      mockCreateBeat.mockResolvedValue({ ok: true, data: { id: "new-1" } });
      const input = { title: "New beat", type: "task", priority: 2 as const, labels: [] };
      const result = await backend.create(input, "/repo");
      expect(mockCreateBeat).toHaveBeenCalledWith(input, "/repo");
      expect(result.ok).toBe(true);
      expect(result.data).toEqual({ id: "new-1" });
    });
  });

  describe("update", () => {
    it("delegates to bd.updateBeat", async () => {
      mockUpdateBeat.mockResolvedValue({ ok: true });
      const input = { title: "Updated" };
      const result = await backend.update("test-1", input, "/repo");
      expect(mockUpdateBeat).toHaveBeenCalledWith("test-1", input, "/repo");
      expect(result.ok).toBe(true);
    });
  });

  describe("delete", () => {
    it("delegates to bd.deleteBeat", async () => {
      mockDeleteBeat.mockResolvedValue({ ok: true });
      const result = await backend.delete("test-1", "/repo");
      expect(mockDeleteBeat).toHaveBeenCalledWith("test-1", "/repo");
      expect(result.ok).toBe(true);
    });
  });

  describe("close", () => {
    it("delegates to bd.closeBeat with reason", async () => {
      mockCloseBeat.mockResolvedValue({ ok: true });
      const result = await backend.close("test-1", "done", "/repo");
      expect(mockCloseBeat).toHaveBeenCalledWith("test-1", "done", "/repo");
      expect(result.ok).toBe(true);
    });

    it("delegates without reason", async () => {
      mockCloseBeat.mockResolvedValue({ ok: true });
      const result = await backend.close("test-1");
      expect(mockCloseBeat).toHaveBeenCalledWith("test-1", undefined, undefined);
      expect(result.ok).toBe(true);
    });
  });

  describe("listDependencies", () => {
    it("delegates to bd.listDeps", async () => {
      mockListDeps.mockResolvedValue({ ok: true, data: [SAMPLE_DEP] });
      const result = await backend.listDependencies("test-1", "/repo", { type: "blocks" });
      expect(mockListDeps).toHaveBeenCalledWith("test-1", "/repo", { type: "blocks" });
      expect(result.ok).toBe(true);
      expect(result.data).toEqual([SAMPLE_DEP]);
    });
  });

  describe("addDependency", () => {
    it("delegates to bd.addDep", async () => {
      mockAddDep.mockResolvedValue({ ok: true });
      const result = await backend.addDependency("a", "b", "/repo");
      expect(mockAddDep).toHaveBeenCalledWith("a", "b", "/repo");
      expect(result.ok).toBe(true);
    });
  });

  describe("removeDependency", () => {
    it("delegates to bd.removeDep", async () => {
      mockRemoveDep.mockResolvedValue({ ok: true });
      const result = await backend.removeDependency("a", "b", "/repo");
      expect(mockRemoveDep).toHaveBeenCalledWith("a", "b", "/repo");
      expect(result.ok).toBe(true);
    });
  });

  // ── buildTakePrompt ───────────────────────────────────────

  describe("buildTakePrompt", () => {
    it("returns NOT_FOUND when beat does not exist", async () => {
      mockShowBeat.mockResolvedValue({ ok: false, error: "not found" });
      const result = await backend.buildTakePrompt("missing-1", undefined, "/repo");
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("NOT_FOUND");
    });

    it("returns parent prompt with child IDs when isParent", async () => {
      mockShowBeat.mockResolvedValue({ ok: true, data: CLAIMABLE_BEAT });
      const opts = { isParent: true, childBeatIds: ["child-a", "child-b"] };
      const result = await backend.buildTakePrompt("claimable-1", opts, "/repo");
      expect(result.ok).toBe(true);
      expect(result.data?.claimed).toBe(false);
      expect(result.data?.prompt).toContain("Parent beat ID:");
      expect(result.data?.prompt).toContain("child-a");
      expect(result.data?.prompt).toContain("child-b");
    });

    it("claims queued agent-claimable beat and returns rich prompt", async () => {
      mockShowBeat.mockResolvedValue({ ok: true, data: CLAIMABLE_BEAT });
      mockUpdateBeat.mockResolvedValue({ ok: true });

      const result = await backend.buildTakePrompt("claimable-1", undefined, "/repo");

      expect(result.ok).toBe(true);
      expect(result.data?.claimed).toBe(true);
      expect(result.data?.prompt).toBeTruthy();
      expect(mockUpdateBeat).toHaveBeenCalledWith(
        "claimable-1",
        expect.objectContaining({ state: expect.any(String) }),
        "/repo",
      );
    });

    it("returns simple prompt for non-claimable beat", async () => {
      mockShowBeat.mockResolvedValue({ ok: true, data: ACTIVE_BEAT });

      const result = await backend.buildTakePrompt("active-1", undefined, "/repo");

      expect(result.ok).toBe(true);
      expect(result.data?.claimed).toBe(false);
      expect(result.data?.prompt).toContain("Beat ID: active-1");
      expect(result.data?.prompt).toContain("bd show");
      expect(mockUpdateBeat).not.toHaveBeenCalled();
    });

    it("returns simple prompt when claim update fails", async () => {
      mockShowBeat.mockResolvedValue({ ok: true, data: CLAIMABLE_BEAT });
      mockUpdateBeat.mockResolvedValue({ ok: false, error: "update failed" });

      const result = await backend.buildTakePrompt("claimable-1");

      expect(result.ok).toBe(true);
      expect(result.data?.claimed).toBe(false);
      expect(result.data?.prompt).toContain("Beat ID: claimable-1");
    });
  });

  // ── buildPollPrompt ───────────────────────────────────────

  describe("buildPollPrompt", () => {
    it("claims highest-priority claimable beat", async () => {
      const lowPri = { ...CLAIMABLE_BEAT, id: "low", priority: 3 } as Beat;
      const highPri = { ...CLAIMABLE_BEAT, id: "high", priority: 1 } as Beat;
      mockReadyBeats.mockResolvedValue({ ok: true, data: [lowPri, highPri] });
      mockUpdateBeat.mockResolvedValue({ ok: true });

      const result = await backend.buildPollPrompt(undefined, "/repo");

      expect(result.ok).toBe(true);
      expect(result.data?.claimedId).toBe("high");
      expect(result.data?.prompt).toBeTruthy();
      expect(mockUpdateBeat).toHaveBeenCalledWith(
        "high",
        expect.objectContaining({ state: expect.any(String) }),
        "/repo",
      );
    });

    it("returns NOT_FOUND when no claimable beats exist", async () => {
      mockReadyBeats.mockResolvedValue({ ok: true, data: [] });

      const result = await backend.buildPollPrompt();
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("NOT_FOUND");
    });

    it("returns NOT_FOUND when listReady fails", async () => {
      mockReadyBeats.mockResolvedValue({ ok: false, error: "db error" });

      const result = await backend.buildPollPrompt();
      expect(result.ok).toBe(false);
    });

    it("skips non-agent-claimable beats", async () => {
      mockReadyBeats.mockResolvedValue({ ok: true, data: [ACTIVE_BEAT] });

      const result = await backend.buildPollPrompt();
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("NOT_FOUND");
    });
  });

  // ── create then buildTakePrompt ───────────────────────────

  describe("create then buildTakePrompt", () => {
    it("can take a beat immediately after creating it", async () => {
      mockCreateBeat.mockResolvedValue({ ok: true, data: { id: "new-1" } });
      mockShowBeat.mockResolvedValue({ ok: true, data: { ...CLAIMABLE_BEAT, id: "new-1" } });
      mockUpdateBeat.mockResolvedValue({ ok: true });

      const createResult = await backend.create({ title: "task" } as never, "/repo");
      expect(createResult.ok).toBe(true);

      const takeResult = await backend.buildTakePrompt("new-1", undefined, "/repo");
      expect(takeResult.ok).toBe(true);
      expect(takeResult.data?.claimed).toBe(true);
      expect(mockShowBeat).toHaveBeenCalledWith("new-1", "/repo");
      expect(mockUpdateBeat).toHaveBeenCalled();
    });
  });
});
