import { describe, expect, it } from "vitest";
import { canTakeBeat, type TakeEligibleBeat } from "@/lib/beat-take-eligibility";

function makeBeat(overrides: Partial<TakeEligibleBeat> = {}): TakeEligibleBeat {
  return {
    state: "ready_for_implementation",
    type: "work",
    nextActionOwnerKind: "agent",
    isAgentClaimable: true,
    ...overrides,
  };
}

describe("canTakeBeat", () => {
  it("allows queue states like ready_for_implementation", () => {
    expect(canTakeBeat(makeBeat())).toBe(true);
  });

  it("blocks terminal states", () => {
    expect(canTakeBeat(makeBeat({ state: "shipped" }))).toBe(false);
    expect(canTakeBeat(makeBeat({ state: "abandoned" }))).toBe(false);
    expect(canTakeBeat(makeBeat({ state: "closed" }))).toBe(false);
  });

  it("blocks gate beats", () => {
    expect(canTakeBeat(makeBeat({ type: "gate" }))).toBe(false);
  });

  it("blocks human-owned next actions", () => {
    expect(canTakeBeat(makeBeat({ nextActionOwnerKind: "human" }))).toBe(false);
  });

  it("blocks beats explicitly marked not claimable", () => {
    expect(canTakeBeat(makeBeat({ isAgentClaimable: false }))).toBe(false);
  });

  it("blocks beats with active dependency blockers", () => {
    expect(canTakeBeat(makeBeat({ blockedByDependency: true }))).toBe(false);
  });

  it("allows beats with no active dependency blockers", () => {
    expect(canTakeBeat(makeBeat({ blockedByDependency: false }))).toBe(true);
  });

  it("allows beats with undefined blockedByDependency", () => {
    expect(canTakeBeat(makeBeat({ blockedByDependency: undefined }))).toBe(true);
  });
});
