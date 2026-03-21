import type { Beat } from "@/lib/types";

export type TakeEligibleBeat = Pick<
  Beat,
  "state" | "type" | "nextActionOwnerKind" | "isAgentClaimable" | "blockedByDependency"
>;

export function canTakeBeat(beat: TakeEligibleBeat): boolean {
  const isTerminal =
    beat.state === "shipped" ||
    beat.state === "abandoned" ||
    beat.state === "closed";
  if (isTerminal) return false;
  if (beat.type === "gate") return false;
  if (beat.nextActionOwnerKind === "human") return false;
  if (beat.blockedByDependency) return false;
  return beat.isAgentClaimable !== false;
}
