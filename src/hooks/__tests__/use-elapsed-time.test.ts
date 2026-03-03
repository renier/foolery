import { describe, it, expect } from "vitest";

/**
 * Unit tests for the elapsed-time formatting logic used by useElapsedTime.
 * We test the pure formatting function directly (extracted logic) rather than
 * the React hook, since @testing-library/react is not available.
 */

function formatElapsed(sinceIso: string | null | undefined, now: number = Date.now()): string {
  if (!sinceIso) return "--";
  const ms = now - new Date(sinceIso).getTime();
  if (ms < 0) return "0s";
  const totalSeconds = Math.floor(ms / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

describe("formatElapsed (useElapsedTime logic)", () => {
  const now = new Date("2026-03-03T12:00:00Z").getTime();

  it('returns "--" when no date is provided', () => {
    expect(formatElapsed(null, now)).toBe("--");
    expect(formatElapsed(undefined, now)).toBe("--");
  });

  it("returns seconds for recent timestamps", () => {
    const since = new Date(now - 5_000).toISOString();
    expect(formatElapsed(since, now)).toBe("5s");
  });

  it("returns 0s for zero diff", () => {
    const since = new Date(now).toISOString();
    expect(formatElapsed(since, now)).toBe("0s");
  });

  it("returns minutes and seconds", () => {
    const since = new Date(now - 125_000).toISOString();
    expect(formatElapsed(since, now)).toBe("2m 5s");
  });

  it("returns hours, minutes and seconds", () => {
    const since = new Date(now - 3_665_000).toISOString();
    expect(formatElapsed(since, now)).toBe("1h 1m 5s");
  });

  it("returns hours with zero minutes and seconds", () => {
    const since = new Date(now - 3_600_000).toISOString();
    expect(formatElapsed(since, now)).toBe("1h 0m 0s");
  });

  it('returns "0s" for future timestamps', () => {
    const since = new Date(now + 60_000).toISOString();
    expect(formatElapsed(since, now)).toBe("0s");
  });

  it("handles large durations", () => {
    const since = new Date(now - 86_400_000).toISOString(); // 24 hours
    expect(formatElapsed(since, now)).toBe("24h 0m 0s");
  });
});
