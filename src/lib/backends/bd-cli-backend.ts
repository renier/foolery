/**
 * BdCliBackend -- BackendPort adapter that delegates to the bd CLI wrapper.
 *
 * Converts BdResult<T> (string error) into BackendResult<T> (structured error)
 * using the error classification helpers from backend-errors.ts.
 */

import type {
  BackendPort,
  BackendResult,
  BeatListFilters,
  BeatQueryOptions,
  PollPromptOptions,
  PollPromptResult,
  TakePromptOptions,
  TakePromptResult,
} from "@/lib/backend-port";
import type { BackendCapabilities } from "@/lib/backend-capabilities";
import { FULL_CAPABILITIES } from "@/lib/backend-capabilities";
import type { BackendErrorCode } from "@/lib/backend-errors";
import {
  classifyErrorMessage,
  isRetryableByDefault,
} from "@/lib/backend-errors";
import type { CreateBeatInput, UpdateBeatInput } from "@/lib/schemas";
import type { Beat, BeatDependency, MemoryWorkflowDescriptor } from "@/lib/types";
import {
  builtinProfileDescriptor,
  builtinWorkflowDescriptors,
  forwardTransitionTarget,
  resolveStep,
  StepPhase,
} from "@/lib/workflows";
import { getBeatsSkillPrompt } from "@/lib/beats-skill-prompts";
import * as bd from "@/lib/bd";

// ── BdResult -> BackendResult converter ───────────────────────────

/**
 * Converts a BdResult (plain string error) into a BackendResult
 * (structured BackendError with code, message, retryable).
 */
function toBR<T>(result: {
  ok: boolean;
  data?: T;
  error?: string;
}): BackendResult<T> {
  if (result.ok) {
    return { ok: true, data: result.data };
  }
  const msg = result.error ?? "Unknown error";
  const code = classifyErrorMessage(msg);
  return {
    ok: false,
    error: { code, message: msg, retryable: isRetryableByDefault(code) },
  };
}

function backendError(
  code: BackendErrorCode,
  message: string,
): BackendResult<never> {
  return { ok: false, error: { code, message, retryable: isRetryableByDefault(code) } };
}

// ── Filters cast helper ──────────────────────────────────────────

/** Cast typed BeatListFilters to Record<string, string> for bd.ts functions. */
function filtersToRecord(
  filters?: BeatListFilters,
): Record<string, string> | undefined {
  if (!filters) return undefined;
  const record: Record<string, string> = {};
  for (const [key, val] of Object.entries(filters)) {
    if (val !== undefined && val !== null) {
      record[key] = String(val);
    }
  }
  return Object.keys(record).length > 0 ? record : undefined;
}

// ── BdCliBackend ─────────────────────────────────────────────────

export class BdCliBackend implements BackendPort {
  readonly capabilities: BackendCapabilities = FULL_CAPABILITIES;

  async listWorkflows(
    _repoPath?: string,
  ): Promise<BackendResult<MemoryWorkflowDescriptor[]>> {
    return { ok: true, data: builtinWorkflowDescriptors() };
  }

  async list(
    filters?: BeatListFilters,
    repoPath?: string,
  ): Promise<BackendResult<Beat[]>> {
    return toBR(await bd.listBeats(filtersToRecord(filters), repoPath));
  }

  async listReady(
    filters?: BeatListFilters,
    repoPath?: string,
  ): Promise<BackendResult<Beat[]>> {
    return toBR(await bd.readyBeats(filtersToRecord(filters), repoPath));
  }

  async search(
    query: string,
    filters?: BeatListFilters,
    repoPath?: string,
  ): Promise<BackendResult<Beat[]>> {
    return toBR(
      await bd.searchBeats(query, filtersToRecord(filters), repoPath),
    );
  }

  async query(
    expression: string,
    options?: BeatQueryOptions,
    repoPath?: string,
  ): Promise<BackendResult<Beat[]>> {
    return toBR(await bd.queryBeats(expression, options, repoPath));
  }

  async get(id: string, repoPath?: string): Promise<BackendResult<Beat>> {
    return toBR(await bd.showBeat(id, repoPath));
  }

  async create(
    input: CreateBeatInput,
    repoPath?: string,
  ): Promise<BackendResult<{ id: string }>> {
    return toBR(
      await bd.createBeat(
        input as unknown as Record<string, string | string[] | number | undefined>,
        repoPath,
      ),
    );
  }

  async update(
    id: string,
    input: UpdateBeatInput,
    repoPath?: string,
  ): Promise<BackendResult<void>> {
    return toBR(
      await bd.updateBeat(
        id,
        input as unknown as Record<string, string | string[] | number | undefined>,
        repoPath,
      ),
    );
  }

  async delete(id: string, repoPath?: string): Promise<BackendResult<void>> {
    return toBR(await bd.deleteBeat(id, repoPath));
  }

  async close(
    id: string,
    reason?: string,
    repoPath?: string,
  ): Promise<BackendResult<void>> {
    return toBR(await bd.closeBeat(id, reason, repoPath));
  }

  async listDependencies(
    id: string,
    repoPath?: string,
    options?: { type?: string },
  ): Promise<BackendResult<BeatDependency[]>> {
    return toBR(await bd.listDeps(id, repoPath, options));
  }

  async addDependency(
    blockerId: string,
    blockedId: string,
    repoPath?: string,
  ): Promise<BackendResult<void>> {
    return toBR(await bd.addDep(blockerId, blockedId, repoPath));
  }

  async removeDependency(
    blockerId: string,
    blockedId: string,
    repoPath?: string,
  ): Promise<BackendResult<void>> {
    return toBR(await bd.removeDep(blockerId, blockedId, repoPath));
  }

  // ── Prompt building (uses bd show/update/ready directly) ───────

  async buildTakePrompt(
    beatId: string,
    options?: TakePromptOptions,
    repoPath?: string,
  ): Promise<BackendResult<TakePromptResult>> {
    const getResult = await this.get(beatId, repoPath);
    if (!getResult.ok || !getResult.data) {
      console.error(`[bd-cli-backend] buildTakePrompt: bd show ${beatId} failed (cwd=${repoPath ?? "undefined"}): ${getResult.error?.message ?? "unknown"}`);
      return backendError("NOT_FOUND", `Beat ${beatId} not found`);
    }
    const beat = getResult.data;
    const showCmd = `bd show ${JSON.stringify(beatId)}`;

    if (options?.isParent && options.childBeatIds?.length) {
      const childIds = options.childBeatIds;
      const prompt = [
        `Parent beat ID: ${beatId}`,
        `Use \`${showCmd}\` and \`bd show "<child-id>"\` to inspect full details before starting.`,
        ``,
        `Open child beat IDs:`,
        ...childIds.map((id) => `- ${id}`),
      ].join("\n");
      return { ok: true, data: { prompt, claimed: false } };
    }

    const shouldClaim =
      resolveStep(beat.state)?.phase === StepPhase.Queued &&
      beat.isAgentClaimable;
    if (shouldClaim) {
      const claimResult = await this.claimBeat(beat, repoPath);
      if (claimResult) {
        const richPrompt = getBeatsSkillPrompt(claimResult.step, beatId, claimResult.target);
        return { ok: true, data: { prompt: richPrompt, claimed: true } };
      }
    }

    const prompt = [
      `Beat ID: ${beatId}`,
      `Use \`${showCmd}\` to inspect full details before starting.`,
    ].join("\n");
    return { ok: true, data: { prompt, claimed: false } };
  }

  async buildPollPrompt(
    _options?: PollPromptOptions,
    repoPath?: string,
  ): Promise<BackendResult<PollPromptResult>> {
    const readyResult = await this.listReady(undefined, repoPath);
    if (!readyResult.ok) return readyResult as BackendResult<never>;

    const claimable = (readyResult.data ?? [])
      .filter((b) => b.isAgentClaimable)
      .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));

    if (claimable.length === 0) {
      return backendError("NOT_FOUND", "No claimable beats available");
    }

    const beat = claimable[0]!;
    const claimResult = await this.claimBeat(beat, repoPath);
    if (!claimResult) {
      return backendError("NOT_FOUND", "No claimable beats available");
    }

    const prompt = getBeatsSkillPrompt(claimResult.step, beat.id, claimResult.target);
    return { ok: true, data: { prompt, claimedId: beat.id } };
  }

  private async claimBeat(
    beat: Beat,
    repoPath?: string,
  ): Promise<{ target: string; step: import("@/lib/workflows").WorkflowStep } | null> {
    const resolved = resolveStep(beat.state);
    if (!resolved || resolved.phase !== StepPhase.Queued) return null;
    if (!beat.isAgentClaimable) return null;

    const profileId = beat.profileId ?? beat.workflowId;
    const workflow = builtinProfileDescriptor(profileId);
    const target = forwardTransitionTarget(beat.state, workflow);
    if (!target) return null;

    const activeResolved = resolveStep(target);
    if (!activeResolved) return null;

    const updateResult = await this.update(beat.id, { state: target }, repoPath);
    if (!updateResult.ok) return null;

    return { target, step: activeResolved.step };
  }
}
