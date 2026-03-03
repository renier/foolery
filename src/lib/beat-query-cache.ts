import type { QueryClient } from "@tanstack/react-query";

export const BEAT_LIST_QUERY_KEY = ["beads"] as const;

type QueryClientLike = Pick<QueryClient, "invalidateQueries">;

/**
 * Invalidate beat list queries so completion/focus-driven UI updates refresh immediately.
 */
export function invalidateBeatListQueries(queryClient: QueryClientLike): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: [...BEAT_LIST_QUERY_KEY] });
}
