import { updateBead } from "@/lib/api";
import type { UpdateBeatInput } from "@/lib/schemas";
import type { Beat } from "@/lib/types";

function repoPathForBeat(beat: Beat | undefined): string | undefined {
  const record = beat as (Beat & { _repoPath?: unknown }) | undefined;
  const repoPath = record?._repoPath;
  return typeof repoPath === "string" && repoPath.trim().length > 0
    ? repoPath
    : undefined;
}

/**
 * Update a beat and throw when the backend rejects the mutation.
 * React Query mutation handlers rely on throws to enter onError.
 */
export async function updateBeatOrThrow(
  beats: Beat[],
  id: string,
  fields: UpdateBeatInput,
): Promise<void> {
  const beat = beats.find((entry) => entry.id === id);
  const result = await updateBead(id, fields, repoPathForBeat(beat));
  if (!result.ok) {
    throw new Error(result.error ?? "Failed to update beat");
  }
}
