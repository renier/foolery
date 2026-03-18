/**
 * Startup reconciler for orphaned beats.
 *
 * On server boot, scans all registered repos for beats stuck in
 * agent-owned action states (e.g. "implementing", "planning") with no
 * corresponding live session.  Rolls each one back to its queue state
 * so the beat can be re-taken.
 */

import { listRepos } from "@/lib/registry";
import { getBackend } from "@/lib/backend-instance";
import { resolveMemoryManagerType, rollbackBeatState } from "@/lib/memory-manager-commands";
import {
  resolveStep,
  StepPhase,
  queueStateForStep,
  builtinProfileDescriptor,
  defaultWorkflowDescriptor,
  isQueueOrTerminal,
} from "@/lib/workflows";
import type { Beat, MemoryWorkflowDescriptor } from "@/lib/types";

const TAG = "[orphan-reconciler]";

export interface ReconcileResult {
  scannedRepos: number;
  rolledBack: Array<{ repoPath: string; beatId: string; fromState: string; toState: string }>;
  errors: Array<{ repoPath: string; beatId: string; message: string }>;
}

function resolveWorkflowForBeat(
  beat: Beat,
  fallbackWorkflow: MemoryWorkflowDescriptor,
): MemoryWorkflowDescriptor {
  const profileDescriptor = builtinProfileDescriptor(beat.profileId ?? beat.workflowId);
  return profileDescriptor ?? fallbackWorkflow;
}

function isAgentOwnedActionState(
  beat: Beat,
  workflow: MemoryWorkflowDescriptor,
): boolean {
  const resolved = resolveStep(beat.state);
  if (!resolved || resolved.phase !== StepPhase.Active) return false;
  const ownerKind = workflow.owners?.[resolved.step] ?? beat.nextActionOwnerKind ?? "agent";
  return ownerKind === "agent";
}

async function reconcileRepo(
  repoPath: string,
  result: ReconcileResult,
): Promise<void> {
  const backend = getBackend();
  const memoryManagerType = resolveMemoryManagerType(repoPath);

  const listResult = await backend.list(undefined, repoPath);
  if (!listResult.ok || !listResult.data) {
    console.warn(`${TAG} skipping ${repoPath}: list failed — ${listResult.error?.message ?? "unknown"}`);
    return;
  }

  const workflowsResult = await backend.listWorkflows(repoPath);
  const workflows = workflowsResult.ok ? workflowsResult.data ?? [] : [];
  const fallbackWorkflow = workflows[0] ?? defaultWorkflowDescriptor();

  const orphanedBeats = listResult.data.filter((beat) => {
    if (isQueueOrTerminal(beat.state, fallbackWorkflow)) return false;
    const workflow = resolveWorkflowForBeat(beat, fallbackWorkflow);
    return isAgentOwnedActionState(beat, workflow);
  });

  for (const beat of orphanedBeats) {
    const resolved = resolveStep(beat.state);
    if (!resolved) continue;

    const fromState = beat.state;
    const rollbackState = queueStateForStep(resolved.step);
    try {
      await rollbackBeatState(
        beat.id,
        fromState,
        rollbackState,
        repoPath,
        memoryManagerType,
        `Foolery startup reconciler: rolled back from ${fromState} to ${rollbackState} — no live session found`,
      );
      console.log(`${TAG} rolled back ${beat.id}: ${fromState} -> ${rollbackState} (${repoPath})`);
      result.rolledBack.push({
        repoPath,
        beatId: beat.id,
        fromState,
        toState: rollbackState,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${TAG} rollback failed for ${beat.id} in ${repoPath}: ${message}`);
      result.errors.push({ repoPath, beatId: beat.id, message });
    }
  }
}

export async function reconcileOrphanedBeats(): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    scannedRepos: 0,
    rolledBack: [],
    errors: [],
  };

  const repos = await listRepos();
  if (repos.length === 0) {
    console.log(`${TAG} no registered repos — skipping reconciliation`);
    return result;
  }

  console.log(`${TAG} scanning ${repos.length} registered repo(s) for orphaned beats...`);

  for (const repo of repos) {
    result.scannedRepos++;
    try {
      await reconcileRepo(repo.path, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`${TAG} error scanning ${repo.path}: ${message}`);
    }
  }

  if (result.rolledBack.length > 0) {
    console.log(
      `${TAG} reconciled ${result.rolledBack.length} orphaned beat(s) across ${result.scannedRepos} repo(s)`,
    );
  } else {
    console.log(`${TAG} no orphaned beats found across ${result.scannedRepos} repo(s)`);
  }

  return result;
}
