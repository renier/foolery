import { describe, it, expect } from "vitest";
import {
  formatAgentDisplayLabel,
  formatAgentOptionLabel,
  parseAgentDisplayParts,
} from "../agent-identity";

describe("parseAgentDisplayParts", () => {
  it("adds cli pill for claude agent", () => {
    const result = parseAgentDisplayParts({
      command: "claude",
      model: "claude-sonnet-4",
    });
    expect(result.pills).toEqual(["cli"]);
    expect(result.label).toContain("Sonnet");
  });

  it("adds cli pill for codex agent", () => {
    const result = parseAgentDisplayParts({
      command: "codex",
      model: "gpt-4.1",
    });
    expect(result.pills).toEqual(["cli"]);
    expect(result.label).toBeTruthy();
  });

  it("parses opencode model with openrouter path", () => {
    const result = parseAgentDisplayParts({
      command: "opencode",
      model: "/openrouter/mistral/devstral-2512",
    });
    expect(result.label).toBe("Mistral Devstral 2512");
    expect(result.pills).toEqual(["openrouter", "cli"]);
  });

  it("parses opencode model with opencode provider path", () => {
    const result = parseAgentDisplayParts({
      command: "opencode",
      model: "/opencode/anthropic/claude-sonnet-4",
    });
    expect(result.label).toBe("Anthropic Claude Sonnet 4");
    expect(result.pills).toEqual(["opencode", "cli"]);
  });

  it("parses opencode model with two-token path", () => {
    const result = parseAgentDisplayParts({
      command: "opencode",
      model: "mistral/devstral-2512",
    });
    expect(result.label).toBe("Mistral Devstral 2512");
    expect(result.pills).toEqual(["cli"]);
  });

  it("handles opencode model without path", () => {
    const result = parseAgentDisplayParts({
      command: "opencode",
      model: "devstral",
    });
    expect(result.label).toBe("Devstral");
    expect(result.pills).toEqual(["opencode", "cli"]);
  });

  it("handles opencode with no model", () => {
    const result = parseAgentDisplayParts({
      command: "opencode",
    });
    expect(result.label).toBe("OpenCode");
    expect(result.pills).toEqual(["cli"]);
  });

  it("parses crush model with provider/model path", () => {
    const result = parseAgentDisplayParts({
      command: "crush",
      model: "bedrock/anthropic.claude-opus-4-6-v1",
    });
    expect(result.label).toBe("Bedrock Anthropic Claude Opus 4 6 V1");
    expect(result.pills).toEqual(["bedrock", "cli"]);
  });

  it("parses crush model with deeper provider path", () => {
    const result = parseAgentDisplayParts({
      command: "crush",
      model: "openrouter/mistral/devstral-2512",
    });
    expect(result.label).toBe("Mistral Devstral 2512");
    expect(result.pills).toEqual(["openrouter", "cli"]);
  });

  it("handles crush with no model", () => {
    const result = parseAgentDisplayParts({
      command: "crush",
    });
    expect(result.label).toBe("Crush");
    expect(result.pills).toEqual(["cli"]);
  });

  it("formats crush display labels via the shared formatter", () => {
    expect(
      formatAgentDisplayLabel({
        command: "crush",
        provider: "Crush",
        model: "bedrock/anthropic.claude-opus-4-6-v1",
      }),
    ).toBe("Bedrock Anthropic Claude Opus 4 6 V1");

    expect(
      formatAgentOptionLabel({
        provider: "Crush",
        model: "openrouter/mistral/devstral-2512",
      }),
    ).toBe("Mistral Devstral 2512");

    expect(
      formatAgentDisplayLabel({
        command: "crush",
        provider: "crush",
        model: "bedrock/anthropic.claude-opus-4-6-v1",
      }),
    ).toBe("Bedrock Anthropic Claude Opus 4 6 V1");
  });

  it("adds cli pill for gemini agent", () => {
    const result = parseAgentDisplayParts({
      command: "gemini",
      model: "gemini-2.5-pro",
    });
    expect(result.pills).toEqual(["cli"]);
    expect(result.label).toContain("Gemini");
  });
});
