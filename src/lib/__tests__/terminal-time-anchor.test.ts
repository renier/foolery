import { describe, expect, it } from "vitest";

import { resolveTerminalElapsedAnchor } from "@/lib/terminal-time-anchor";

describe("resolveTerminalElapsedAnchor", () => {
  it("prefers latest take start when available", () => {
    expect(
      resolveTerminalElapsedAnchor({
        createdAt: "2026-03-01T10:00:00.000Z",
        latestTakeStartedAt: "2026-03-03T14:30:00.000Z",
      })
    ).toBe("2026-03-03T14:30:00.000Z");
  });

  it("falls back to createdAt when take time is missing", () => {
    expect(
      resolveTerminalElapsedAnchor({
        createdAt: "2026-03-01T10:00:00.000Z",
      })
    ).toBe("2026-03-01T10:00:00.000Z");
  });

  it("ignores empty strings", () => {
    expect(
      resolveTerminalElapsedAnchor({
        createdAt: " 2026-03-01T10:00:00.000Z ",
        latestTakeStartedAt: "   ",
      })
    ).toBe("2026-03-01T10:00:00.000Z");
  });

  it("returns null when no usable timestamp exists", () => {
    expect(resolveTerminalElapsedAnchor(undefined)).toBeNull();
    expect(resolveTerminalElapsedAnchor(null)).toBeNull();
    expect(resolveTerminalElapsedAnchor({ createdAt: "", latestTakeStartedAt: " " })).toBeNull();
  });
});

