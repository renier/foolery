import { detectMemoryManagerType } from "@/lib/memory-manager-detection";
import type { MemoryManagerType } from "@/lib/memory-managers";
import { mapWorkflowStateToCompatStatus } from "@/lib/workflows";

import type { Beat } from "@/lib/types";

interface MemoryManagerCommandOptions {
  leaseId?: string;
  fromState?: string;
}

function quoteId(id: string): string {
  return JSON.stringify(id);
}

function quoteArg(value: string): string {
  return JSON.stringify(value);
}

export function resolveMemoryManagerType(repoPath?: string): MemoryManagerType {
  if (!repoPath) return "beads";
  return detectMemoryManagerType(repoPath) ?? "beads";
}

export function buildShowIssueCommand(id: string, memoryManagerType: MemoryManagerType): string {
  if (memoryManagerType === "knots") return `kno show ${quoteId(id)}`;
  return `bd show ${quoteId(id)}`;
}

export function buildClaimCommand(id: string, memoryManagerType: MemoryManagerType, leaseId?: string): string {
  if (memoryManagerType === "knots") {
    const base = `kno claim ${quoteId(id)} --json`;
    return leaseId ? `${base} --lease ${quoteArg(leaseId)}` : base;
  }
  return buildShowIssueCommand(id, memoryManagerType);
}

export function buildWorkflowStateCommand(
  id: string,
  workflowState: string,
  memoryManagerType: MemoryManagerType,
  options?: MemoryManagerCommandOptions,
): string {
  const normalizedState = workflowState.trim().toLowerCase();
  if (memoryManagerType === "knots") {
    const base = `kno next ${quoteId(id)} --expected-state ${quoteArg(normalizedState)} --actor-kind agent`;
    return options?.leaseId ? `${base} --lease ${quoteArg(options.leaseId)}` : base;
  }
  const compatStatus = mapWorkflowStateToCompatStatus(normalizedState, "memory-manager-commands");
  const qid = quoteId(id);
  const newLabel = quoteArg(`wf:state:${normalizedState}`);
  const parts = [`bd update ${qid} --status ${quoteArg(compatStatus)}`];
  if (options?.fromState) {
    const oldLabel = quoteArg(`wf:state:${options.fromState.trim().toLowerCase()}`);
    parts.push(`bd label remove ${qid} ${oldLabel}`);
  }
  parts.push(`bd label add ${qid} ${newLabel}`);
  return parts.join(" && ");
}

export async function rollbackBeatState(
  beatId: string,
  fromState: string,
  toState: string,
  repoPath: string | undefined,
  memoryManagerType: MemoryManagerType,
  reason?: string,
): Promise<void> {
  if (memoryManagerType === "knots") {
    const { rollbackKnot, updateKnot } = await import("@/lib/knots");
    const result = await rollbackKnot(beatId, repoPath);
    if (!result.ok) throw new Error(result.error ?? "knots rb failed");
    if (reason) {
      try {
        await updateKnot(beatId, { addNote: reason }, repoPath);
      } catch { /* note is best-effort */ }
    }
  } else {
    const { getBackend } = await import("@/lib/backend-instance");
    await getBackend().update(beatId, { state: toState }, repoPath);
  }
}

export function assertClaimable(
  beats: Beat[],
  action: string,
  memoryManagerType: MemoryManagerType,
): void {
  if (memoryManagerType !== "knots") return;
  const blocked = beats.filter((b) => b.isAgentClaimable === false);
  if (blocked.length === 0) return;
  const summary = blocked
    .map((b) => `${b.id}${b.state ? ` (${b.state})` : ""}`)
    .join(", ");
  throw new Error(
    `${action} unavailable: knot is not agent-claimable (${summary})`,
  );
}

export function supportsAutoFollowUp(memoryManagerType: MemoryManagerType): boolean {
  return memoryManagerType !== "knots";
}

