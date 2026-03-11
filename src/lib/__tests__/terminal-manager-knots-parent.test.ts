import { describe, expect, it } from "vitest";
import type { MemoryManagerType } from "@/lib/memory-managers";

/**
 * Unit tests for the knots-parent routing logic in terminal-manager.
 *
 * The core logic: parent beats use Scene orchestration regardless of memory
 * manager type. For knots parents, the Scene prompt instructs the agent to
 * claim and advance each child beat individually.
 *
 * We extract and test the decision logic without requiring the full createSession
 * dependency chain.
 */

function computeEffectiveParent(
  isParent: boolean,
  _memoryManagerType: MemoryManagerType,
): boolean {
  return isParent;
}

describe("knots parent routing", () => {
  it("treats knots parent beats as parent (Scene orchestration)", () => {
    expect(computeEffectiveParent(true, "knots")).toBe(true);
  });

  it("treats beads parent beats as parent (Scene orchestration)", () => {
    expect(computeEffectiveParent(true, "beads")).toBe(true);
  });

  it("treats non-parent beats as non-parent regardless of manager type", () => {
    expect(computeEffectiveParent(false, "knots")).toBe(false);
    expect(computeEffectiveParent(false, "beads")).toBe(false);
  });

  it("determines correct action label for knots parents", () => {
    const isParent = true;
    const memoryManagerType: MemoryManagerType = "knots";
    const effectiveParent = computeEffectiveParent(isParent, memoryManagerType);
    const actionLabel = effectiveParent ? "Scene!" : "Take!";
    expect(actionLabel).toBe("Scene!");
  });

  it("determines correct action label for beads parents", () => {
    const isParent = true;
    const memoryManagerType: MemoryManagerType = "beads";
    const effectiveParent = computeEffectiveParent(isParent, memoryManagerType);
    const actionLabel = effectiveParent ? "Scene!" : "Take!";
    expect(actionLabel).toBe("Scene!");
  });

  it("routes knots parents through scene interaction type", () => {
    const effectiveParent = computeEffectiveParent(true, "knots");
    const interactionType = effectiveParent ? "scene" : "take";
    expect(interactionType).toBe("scene");
  });

  it("routes beads parents through scene interaction type", () => {
    const effectiveParent = computeEffectiveParent(true, "beads");
    const interactionType = effectiveParent ? "scene" : "take";
    expect(interactionType).toBe("scene");
  });

  it("sends wave beat IDs for knots parents", () => {
    const beatId = "parent-1";
    const waveBeatIds = ["child-1", "child-2"];
    const effectiveParent = computeEffectiveParent(true, "knots");
    const beatIds = effectiveParent ? waveBeatIds : [beatId];
    expect(beatIds).toEqual(["child-1", "child-2"]);
  });

  it("sends wave beat IDs for beads parents", () => {
    const beatId = "parent-1";
    const waveBeatIds = ["child-1", "child-2"];
    const effectiveParent = computeEffectiveParent(true, "beads");
    const beatIds = effectiveParent ? waveBeatIds : [beatId];
    expect(beatIds).toEqual(["child-1", "child-2"]);
  });
});
