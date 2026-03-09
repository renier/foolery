import { describe, expect, it } from "vitest";
import { dispatchPreamble } from "@/lib/terminal-manager";

describe("dispatchPreamble", () => {
  it("returns implementation preamble for non-review steps", () => {
    const result = dispatchPreamble(false);
    expect(result).toContain("Implement the following task");
    expect(result).toContain("You MUST edit the actual source files");
  });

  it("returns review preamble for review steps", () => {
    const result = dispatchPreamble(true);
    expect(result).toContain("Review the following work");
    expect(result).toContain("review step");
    expect(result).toContain("Do NOT make code changes unless you find issues");
  });

  it("does not contain review language in implementation preamble", () => {
    const result = dispatchPreamble(false);
    expect(result).not.toContain("Review the following work");
  });

  it("does not contain implementation language in review preamble", () => {
    const result = dispatchPreamble(true);
    expect(result).not.toContain("Implement the following task");
    expect(result).not.toContain("You MUST edit the actual source files");
  });
});
