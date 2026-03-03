import { describe, expect, it } from "vitest";

import {
  isSceneVisibleState,
  parseExistingOrchestrations,
  type ExistingOrchestrationData,
} from "@/components/existing-orchestrations-view";
import type { Beat } from "@/lib/types";
import { ORCHESTRATION_WAVE_LABEL, buildWaveSlugLabel } from "@/lib/wave-slugs";

function makeBeat(overrides: Partial<Beat> & Pick<Beat, "id" | "title" | "state">): Beat {
  return {
    id: overrides.id,
    title: overrides.title,
    type: "work",
    state: overrides.state,
    priority: overrides.priority ?? 2,
    labels: overrides.labels ?? [],
    created: overrides.created ?? "2026-03-03T00:00:00.000Z",
    updated: overrides.updated ?? "2026-03-03T00:00:00.000Z",
    description: overrides.description,
    notes: overrides.notes,
    acceptance: overrides.acceptance,
    workflowId: overrides.workflowId,
    workflowMode: overrides.workflowMode,
    profileId: overrides.profileId,
    nextActionState: overrides.nextActionState,
    nextActionOwnerKind: overrides.nextActionOwnerKind,
    requiresHumanAction: overrides.requiresHumanAction,
    isAgentClaimable: overrides.isAgentClaimable,
    assignee: overrides.assignee,
    owner: overrides.owner,
    parent: overrides.parent,
    due: overrides.due,
    estimate: overrides.estimate,
    closed: overrides.closed,
    metadata: overrides.metadata,
  };
}

describe("existing orchestrations parsing", () => {
  it("treats abandoned beats as hidden in scenes view", () => {
    expect(isSceneVisibleState("ready_for_implementation")).toBe(true);
    expect(isSceneVisibleState("closed")).toBe(false);
    expect(isSceneVisibleState("abandoned")).toBe(false);
  });

  it("excludes abandoned waves and grouped descendants", () => {
    const activeWave = makeBeat({
      id: "W-1",
      title: "Scene alpha: Build stuff",
      state: "implementation",
      labels: [ORCHESTRATION_WAVE_LABEL, buildWaveSlugLabel("alpha")],
      created: "2026-03-03T00:00:00.000Z",
      updated: "2026-03-03T02:00:00.000Z",
    });
    const abandonedWave = makeBeat({
      id: "W-2",
      title: "Scene beta: Deprecated branch",
      state: "abandoned",
      labels: [ORCHESTRATION_WAVE_LABEL, buildWaveSlugLabel("beta")],
      created: "2026-03-03T01:00:00.000Z",
      updated: "2026-03-03T03:00:00.000Z",
    });
    const visibleChild = makeBeat({
      id: "B-1",
      title: "Visible child",
      state: "planning",
      parent: activeWave.id,
      created: "2026-03-03T04:00:00.000Z",
      updated: "2026-03-03T04:00:00.000Z",
    });
    const abandonedChild = makeBeat({
      id: "B-2",
      title: "Abandoned child",
      state: "abandoned",
      parent: activeWave.id,
      created: "2026-03-03T05:00:00.000Z",
      updated: "2026-03-03T05:00:00.000Z",
    });
    const abandonedParent = makeBeat({
      id: "B-3",
      title: "Abandoned parent",
      state: "abandoned",
      parent: activeWave.id,
      created: "2026-03-03T06:00:00.000Z",
      updated: "2026-03-03T06:00:00.000Z",
    });
    const hiddenGrandchild = makeBeat({
      id: "B-4",
      title: "Hidden grandchild",
      state: "implementation",
      parent: abandonedParent.id,
      created: "2026-03-03T07:00:00.000Z",
      updated: "2026-03-03T07:00:00.000Z",
    });

    const data: ExistingOrchestrationData = {
      beats: [activeWave, abandonedWave, visibleChild, abandonedChild, abandonedParent, hiddenGrandchild],
      waves: [activeWave, abandonedWave],
      depsByWaveId: {},
    };

    const parsed = parseExistingOrchestrations(data);

    expect(parsed.waves.map((wave) => wave.id)).toEqual([activeWave.id]);
    expect(parsed.trees).toHaveLength(1);
    expect(parsed.trees[0]?.waves).toHaveLength(1);
    expect(parsed.trees[0]?.waves[0]?.id).toBe(activeWave.id);
    expect(parsed.trees[0]?.waves[0]?.children.map((child) => child.id)).toEqual([visibleChild.id]);
    expect(parsed.trees[0]?.waves[0]?.descendants).toBe(1);
  });
});

