import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDetectMemoryManagerType = vi.fn();

vi.mock("@/lib/memory-manager-detection", () => ({
  detectMemoryManagerType: (...args: unknown[]) => mockDetectMemoryManagerType(...args),
}));

const mockRollbackKnot = vi.fn().mockResolvedValue({ ok: true });
const mockUpdateKnot = vi.fn().mockResolvedValue({ ok: true });
vi.mock("@/lib/knots", () => ({
  rollbackKnot: (...args: unknown[]) => mockRollbackKnot(...args),
  updateKnot: (...args: unknown[]) => mockUpdateKnot(...args),
}));

const mockBackendUpdate = vi.fn().mockResolvedValue({ ok: true });
vi.mock("@/lib/backend-instance", () => ({
  getBackend: () => ({ update: mockBackendUpdate }),
}));

import {
  buildClaimCommand,
  buildWorkflowStateCommand,
  rollbackBeatState,
} from "@/lib/memory-manager-commands";

beforeEach(() => {
  vi.clearAllMocks();
  mockRollbackKnot.mockResolvedValue({ ok: true });
  mockUpdateKnot.mockResolvedValue({ ok: true });
  mockBackendUpdate.mockResolvedValue({ ok: true });
});

describe("buildClaimCommand (line 32-34)", () => {
  it("returns kno claim with --json for knots", () => {
    expect(buildClaimCommand("foo-123", "knots")).toBe(
      'kno claim "foo-123" --json',
    );
  });

  it("returns bd show command for beats (delegates to buildShowIssueCommand)", () => {
    expect(buildClaimCommand("foo-123", "beads")).toBe(
      'bd show "foo-123"',
    );
  });

  it("includes --lease flag when leaseId provided for knots", () => {
    expect(buildClaimCommand("foo-123", "knots", "L-42")).toBe(
      'kno claim "foo-123" --json --lease "L-42"',
    );
  });

  it("omits --lease flag when leaseId not provided for knots", () => {
    expect(buildClaimCommand("foo-123", "knots")).toBe(
      'kno claim "foo-123" --json',
    );
  });

  it("ignores leaseId for beads", () => {
    expect(buildClaimCommand("foo-123", "beads", "L-42")).toBe(
      'bd show "foo-123"',
    );
  });
});

describe("buildWorkflowStateCommand (lines 36-48)", () => {
  it("returns kno next with expected state for knots", () => {
    const cmd = buildWorkflowStateCommand("foo-123", "implementation", "knots");
    expect(cmd).toBe('kno next "foo-123" --expected-state "implementation" --actor-kind agent');
  });

  it("returns bd update + bd label add for beats without fromState", () => {
    const cmd = buildWorkflowStateCommand("foo-123", "implementation", "beads");
    expect(cmd).toContain('bd update "foo-123"');
    expect(cmd).toContain("--status");
    expect(cmd).toContain('bd label add "foo-123" "wf:state:implementation"');
    expect(cmd).not.toContain("--add-label");
    expect(cmd).not.toContain("bd label remove");
  });

  it("returns bd update + bd label remove + bd label add for beats with fromState", () => {
    const cmd = buildWorkflowStateCommand("foo-123", "ready_for_implementation", "beads", { fromState: "plan_review" });
    expect(cmd).toContain('bd update "foo-123"');
    expect(cmd).toContain('bd label remove "foo-123" "wf:state:plan_review"');
    expect(cmd).toContain('bd label add "foo-123" "wf:state:ready_for_implementation"');
  });

  it("normalizes fromState for beats label remove", () => {
    const cmd = buildWorkflowStateCommand("foo-123", "ready_for_implementation", "beads", { fromState: "  PLAN_REVIEW  " });
    expect(cmd).toContain('bd label remove "foo-123" "wf:state:plan_review"');
  });

  it("preserves && ordering: update then remove then add", () => {
    const cmd = buildWorkflowStateCommand("foo-123", "ready_for_implementation", "beads", { fromState: "plan_review" });
    const updateIdx = cmd.indexOf("bd update");
    const removeIdx = cmd.indexOf("bd label remove");
    const addIdx = cmd.indexOf("bd label add");
    expect(updateIdx).toBeLessThan(removeIdx);
    expect(removeIdx).toBeLessThan(addIdx);
  });

  it("normalizes workflow state for knots kno next command", () => {
    const cmd = buildWorkflowStateCommand("foo-123", "  IMPLEMENTATION  ", "knots");
    expect(cmd).toBe('kno next "foo-123" --expected-state "implementation" --actor-kind agent');
  });

  it("includes --lease flag when leaseId provided for knots", () => {
    const cmd = buildWorkflowStateCommand("foo-123", "implementation", "knots", { leaseId: "L-42" });
    expect(cmd).toBe('kno next "foo-123" --expected-state "implementation" --actor-kind agent --lease "L-42"');
  });

  it("omits --lease flag when leaseId not provided for knots", () => {
    const cmd = buildWorkflowStateCommand("foo-123", "implementation", "knots");
    expect(cmd).not.toContain("--lease");
  });

  it("ignores leaseId for beads", () => {
    const cmd = buildWorkflowStateCommand("foo-123", "implementation", "beads", { leaseId: "L-42" });
    expect(cmd).not.toContain("--lease");
  });
});

describe("quoteId helper (line 9)", () => {
  it("JSON-encodes special characters in id for knots", () => {
    const cmd = buildWorkflowStateCommand('id"special', "state", "knots");
    expect(cmd).toBe('kno next "id\\"special" --expected-state "state" --actor-kind agent');
  });

  it("JSON-encodes special characters in id for beats", () => {
    const cmd = buildWorkflowStateCommand('id"special', "state", "beads");
    expect(cmd).toContain('"id\\"special"');
  });
});

describe("rollbackBeatState", () => {
  it("calls rollbackKnot for knots", async () => {
    await rollbackBeatState("beat-42", "implementation", "triage", "/tmp", "knots");
    expect(mockRollbackKnot).toHaveBeenCalledTimes(1);
    expect(mockRollbackKnot).toHaveBeenCalledWith("beat-42", "/tmp");
  });

  it("calls updateKnot to add note when reason is provided for knots", async () => {
    await rollbackBeatState("beat-42", "implementation", "triage", "/tmp", "knots", "flaky test");
    expect(mockRollbackKnot).toHaveBeenCalledTimes(1);
    expect(mockUpdateKnot).toHaveBeenCalledTimes(1);
    expect(mockUpdateKnot).toHaveBeenCalledWith("beat-42", { addNote: "flaky test" }, "/tmp");
  });

  it("does not add a note when reason is omitted for knots", async () => {
    await rollbackBeatState("beat-42", "implementation", "triage", "/tmp", "knots");
    expect(mockRollbackKnot).toHaveBeenCalledTimes(1);
    expect(mockUpdateKnot).not.toHaveBeenCalled();
  });

  it("uses backend.update() for beads instead of knots", async () => {
    await rollbackBeatState("beat-42", "implementation", "triage", "/tmp", "beads");
    expect(mockRollbackKnot).not.toHaveBeenCalled();
    expect(mockBackendUpdate).toHaveBeenCalledWith("beat-42", { state: "triage" }, "/tmp");
  });

  it("propagates errors from rollbackKnot", async () => {
    mockRollbackKnot.mockResolvedValue({ ok: false, error: "knots rb failed" });
    await expect(
      rollbackBeatState("beat-42", "implementation", "triage", "/tmp", "knots"),
    ).rejects.toThrow("knots rb failed");
  });

  it("does not add a note when reason is an empty string for knots", async () => {
    await rollbackBeatState("beat-42", "implementation", "triage", "/tmp", "knots", "");
    expect(mockRollbackKnot).toHaveBeenCalledTimes(1);
    expect(mockUpdateKnot).not.toHaveBeenCalled();
  });

  it("does not add a note when reason is undefined for knots", async () => {
    await rollbackBeatState("beat-42", "implementation", "triage", "/tmp", "knots", undefined);
    expect(mockRollbackKnot).toHaveBeenCalledTimes(1);
    expect(mockUpdateKnot).not.toHaveBeenCalled();
  });
});
