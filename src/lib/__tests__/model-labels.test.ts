import { describe, expect, it } from "vitest";

import { stripCommonModelLabelPrefix } from "@/lib/model-labels";

describe("stripCommonModelLabelPrefix", () => {
  it("strips a shared slash-delimited provider prefix", () => {
    const result = stripCommonModelLabelPrefix([
      "openrouter/anthropic/claude-sonnet-4-5",
      "openrouter/anthropic/claude-opus-4-1",
    ]);

    expect(result.prefix).toBe("openrouter/anthropic/");
    expect(result.stripped).toEqual([
      "claude-sonnet-4-5",
      "claude-opus-4-1",
    ]);
  });

  it("strips a shared colon-delimited prefix", () => {
    const result = stripCommonModelLabelPrefix([
      "provider:model-a",
      "provider:model-b",
    ]);

    expect(result.prefix).toBe("provider:");
    expect(result.stripped).toEqual(["model-a", "model-b"]);
  });

  it("does not strip when common prefix only ends at decimal dots", () => {
    const result = stripCommonModelLabelPrefix([
      "claude-3.5-sonnet",
      "claude-3.7-sonnet",
    ]);

    expect(result.prefix).toBe("");
    expect(result.stripped).toEqual([
      "claude-3.5-sonnet",
      "claude-3.7-sonnet",
    ]);
  });

  it("does not strip if stripping would create empty labels", () => {
    const result = stripCommonModelLabelPrefix([
      "openrouter/anthropic/",
      "openrouter/anthropic/",
    ]);

    expect(result.prefix).toBe("");
    expect(result.stripped).toEqual([
      "openrouter/anthropic/",
      "openrouter/anthropic/",
    ]);
  });
});
