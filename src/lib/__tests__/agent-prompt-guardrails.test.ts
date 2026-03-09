import { describe, expect, it } from "vitest";
import {
  buildSceneExecutionBoundaryLines,
  buildShipFollowUpBoundaryLines,
  buildSingleStepAuthorityLines,
  buildTakeExecutionBoundaryLines,
  wrapExecutionPrompt,
} from "@/lib/agent-prompt-guardrails";

describe("agent prompt guardrails", () => {
  it("builds single-step authority lines for a single exit state", () => {
    const lines = buildSingleStepAuthorityLines("`Planning` workflow", ["ready_for_plan_review"]);

    expect(lines.join("\n")).toContain("This session is authorized only for the current `Planning` workflow action.");
    expect(lines.join("\n")).toContain("Allowed exit state for this session: `ready_for_plan_review`.");
    expect(lines.join("\n")).toContain("Do not claim, inspect, review, or advance later workflow states");
  });

  it("builds single-step authority lines for multiple exit states", () => {
    const lines = buildSingleStepAuthorityLines("`Plan Review` workflow", [
      "ready_for_implementation",
      "ready_for_planning",
    ]);

    expect(lines.join("\n")).toContain("Allowed exit states for this session: `ready_for_implementation` or `ready_for_planning`.");
  });

  it("wraps take prompts with a Foolery execution boundary", () => {
    const wrapped = wrapExecutionPrompt("backend prompt body", "take");

    expect(wrapped).toContain("FOOLERY EXECUTION BOUNDARY:");
    expect(wrapped).toContain("Execute only the currently assigned workflow action described below.");
    expect(wrapped).toContain("backend prompt body");
  });

  it("wraps scene prompts with child-claim guidance", () => {
    const wrapped = wrapExecutionPrompt("scene prompt body", "scene");

    expect(wrapped).toContain("Execute only the child beats explicitly listed below.");
    expect(wrapped).toContain("Treat each child claim as a single-step authorization");
    expect(wrapped).toContain("scene prompt body");
  });

  it("builds ship follow-up boundary lines", () => {
    expect(buildTakeExecutionBoundaryLines().join("\n")).toContain("stop immediately");
    expect(buildSceneExecutionBoundaryLines().join("\n")).toContain("single-step authorization");
    expect(buildShipFollowUpBoundaryLines("single").join("\n")).toContain("merge/push confirmation");
    expect(buildShipFollowUpBoundaryLines("scene").join("\n")).toContain("each listed beat");
  });
});
