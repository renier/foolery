import { describe, expect, it } from "vitest";
import { getBeatsSkillPrompt } from "@/lib/beats-skill-prompts";
import { buildWorkflowStateCommand } from "@/lib/memory-manager-commands";
import { WorkflowStep } from "@/lib/workflows";

describe("getBeatsSkillPrompt", () => {
  const beatId = "foolery-fde6";
  const currentState = "implementation";
  const showCmd = `bd show ${JSON.stringify(beatId)}`;

  const cases = [
    {
      name: "planning prompt",
      step: WorkflowStep.Planning,
      heading: "# Planning",
      transitions: ["ready_for_plan_review"],
    },
    {
      name: "plan review prompt",
      step: WorkflowStep.PlanReview,
      heading: "# Plan Review",
      transitions: ["ready_for_implementation", "ready_for_planning"],
    },
    {
      name: "implementation prompt",
      step: WorkflowStep.Implementation,
      heading: "# Implementation",
      transitions: ["ready_for_implementation_review"],
    },
    {
      name: "implementation review prompt",
      step: WorkflowStep.ImplementationReview,
      heading: "# Implementation Review",
      transitions: ["ready_for_shipment", "ready_for_implementation"],
    },
    {
      name: "shipment prompt",
      step: WorkflowStep.Shipment,
      heading: "# Shipment",
      transitions: ["ready_for_shipment_review"],
    },
    {
      name: "shipment review prompt",
      step: WorkflowStep.ShipmentReview,
      heading: "# Shipment Review",
      transitions: ["shipped", "ready_for_shipment", "ready_for_implementation"],
    },
  ] as const;

  for (const entry of cases) {
    it(entry.name, () => {
      const prompt = getBeatsSkillPrompt(entry.step, beatId, currentState);

      expect(prompt).toContain(entry.heading);
      expect(prompt).toContain(showCmd);
      expect(prompt).not.toContain("bd sync");
      expect(prompt).toContain(currentState);
      expect(prompt).not.toContain("kno claim");
      expect(prompt).toContain("## Authority Boundary");
      expect(prompt).toContain("Complete exactly one workflow action, then stop.");

      for (const workflowState of entry.transitions) {
        const transitionCmd = buildWorkflowStateCommand(beatId, workflowState, "beads", { fromState: currentState });
        expect(prompt).toContain(transitionCmd);
        expect(prompt).toContain(`\`${workflowState}\``);
      }

      if (entry.transitions.length === 1) {
        expect(prompt).toContain("Allowed exit state for this session:");
      } else {
        expect(prompt).toContain("Allowed exit states for this session:");
      }
    });
  }
});
