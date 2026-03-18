import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockBackendPort } from "@/lib/__tests__/mock-backend-port";

const mockBackend = new MockBackendPort();

vi.mock("@/lib/backend-instance", () => ({
  getBackend: () => mockBackend,
}));

const mockListRepos = vi.fn();
vi.mock("@/lib/registry", () => ({
  listRepos: () => mockListRepos(),
}));

vi.mock("@/lib/memory-manager-detection", () => ({
  detectMemoryManagerType: () => "beads",
}));

import { reconcileOrphanedBeats } from "@/lib/orphan-reconciler";

async function seedBeat(title: string, repoPath: string): Promise<string> {
  const result = await mockBackend.create(
    { title, type: "task", priority: 2, labels: [] },
    repoPath,
  );
  return result.data!.id;
}

describe("orphan-reconciler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBackend.reset();
    mockListRepos.mockResolvedValue([]);
  });

  it("returns empty result when no repos are registered", async () => {
    mockListRepos.mockResolvedValue([]);
    const result = await reconcileOrphanedBeats();
    expect(result.scannedRepos).toBe(0);
    expect(result.rolledBack).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("does not roll back beats in queue states", async () => {
    mockListRepos.mockResolvedValue([{ path: "/repo", name: "repo", addedAt: "2026-01-01T00:00:00Z" }]);
    const beatId = await seedBeat("queued beat", "/repo");
    await mockBackend.update(beatId, { state: "ready_for_implementation" }, "/repo");

    const result = await reconcileOrphanedBeats();
    expect(result.scannedRepos).toBe(1);
    expect(result.rolledBack).toHaveLength(0);
  });

  it("does not roll back beats in terminal states", async () => {
    mockListRepos.mockResolvedValue([{ path: "/repo", name: "repo", addedAt: "2026-01-01T00:00:00Z" }]);
    const beatId = await seedBeat("shipped beat", "/repo");
    await mockBackend.update(beatId, { state: "shipped" }, "/repo");

    const result = await reconcileOrphanedBeats();
    expect(result.scannedRepos).toBe(1);
    expect(result.rolledBack).toHaveLength(0);
  });

  it("rolls back a beat stuck in an active action state", async () => {
    mockListRepos.mockResolvedValue([{ path: "/repo", name: "repo", addedAt: "2026-01-01T00:00:00Z" }]);
    const beatId = await seedBeat("stuck beat", "/repo");
    await mockBackend.update(beatId, { state: "implementation" }, "/repo");

    const result = await reconcileOrphanedBeats();
    expect(result.scannedRepos).toBe(1);
    expect(result.rolledBack).toHaveLength(1);
    expect(result.rolledBack[0]).toEqual({
      repoPath: "/repo",
      beatId,
      fromState: "implementation",
      toState: "ready_for_implementation",
    });

    const refreshed = await mockBackend.get(beatId, "/repo");
    expect(refreshed.data?.state).toBe("ready_for_implementation");
  });

  it("rolls back multiple beats in a single repo", async () => {
    mockListRepos.mockResolvedValue([
      { path: "/repo", name: "repo", addedAt: "2026-01-01T00:00:00Z" },
    ]);

    const idA = await seedBeat("stuck A", "/repo");
    const idB = await seedBeat("stuck B", "/repo");
    await mockBackend.update(idA, { state: "planning" }, "/repo");
    await mockBackend.update(idB, { state: "shipment" }, "/repo");

    const result = await reconcileOrphanedBeats();
    expect(result.scannedRepos).toBe(1);
    expect(result.rolledBack).toHaveLength(2);
    expect(result.rolledBack.map((r) => r.toState)).toEqual(
      expect.arrayContaining(["ready_for_planning", "ready_for_shipment"]),
    );
  });

  it("rolls back all six active states to their correct queue state", async () => {
    mockListRepos.mockResolvedValue([{ path: "/repo", name: "repo", addedAt: "2026-01-01T00:00:00Z" }]);

    const activeStates = [
      { active: "planning", queue: "ready_for_planning" },
      { active: "plan_review", queue: "ready_for_plan_review" },
      { active: "implementation", queue: "ready_for_implementation" },
      { active: "implementation_review", queue: "ready_for_implementation_review" },
      { active: "shipment", queue: "ready_for_shipment" },
      { active: "shipment_review", queue: "ready_for_shipment_review" },
    ];

    const beatIds: string[] = [];
    for (const { active } of activeStates) {
      const id = await seedBeat(`stuck in ${active}`, "/repo");
      beatIds.push(id);
    }

    for (let i = 0; i < activeStates.length; i++) {
      await mockBackend.update(beatIds[i], { state: activeStates[i].active }, "/repo");
    }

    const result = await reconcileOrphanedBeats();
    expect(result.rolledBack).toHaveLength(6);

    for (const { active, queue } of activeStates) {
      const entry = result.rolledBack.find((r) => r.fromState === active);
      expect(entry).toBeDefined();
      expect(entry!.toState).toBe(queue);
    }
  });

  it("continues scanning remaining repos when one repo fails", async () => {
    mockListRepos.mockResolvedValue([
      { path: "/bad-repo", name: "bad", addedAt: "2026-01-01T00:00:00Z" },
      { path: "/good-repo", name: "good", addedAt: "2026-01-01T00:00:00Z" },
    ]);

    const beatId = await seedBeat("stuck", "/good-repo");
    await mockBackend.update(beatId, { state: "implementation" }, "/good-repo");

    const originalList = mockBackend.list.bind(mockBackend);
    vi.spyOn(mockBackend, "list").mockImplementation(async (filters, repoPath) => {
      if (repoPath === "/bad-repo") throw new Error("disk error");
      return originalList(filters, repoPath);
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await reconcileOrphanedBeats();

    expect(result.scannedRepos).toBe(2);
    expect(result.rolledBack).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("error scanning /bad-repo"),
    );
  });
});
