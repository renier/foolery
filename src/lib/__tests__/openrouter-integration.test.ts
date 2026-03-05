import { describe, it, expect } from "vitest";
import {
  resolveDialect,
  buildPromptModeArgs,
  createLineNormalizer,
} from "@/lib/agent-adapter";
import {
  OPENROUTER_AGENT_PREFIX,
  openrouterAgentId,
  isOpenRouterAgentId,
  openrouterAgentKey,
  formatOpenRouterAgentLabel,
} from "@/lib/openrouter";

// ── Dialect resolution ─────────────────────────────────────

describe("resolveDialect — openrouter", () => {
  it("returns 'openrouter' for bare command 'openrouter'", () => {
    expect(resolveDialect("openrouter")).toBe("openrouter");
  });

  it("returns 'openrouter' for full path containing openrouter", () => {
    expect(resolveDialect("/usr/local/bin/openrouter")).toBe("openrouter");
  });

  it("returns 'openrouter' for mixed-case path", () => {
    expect(resolveDialect("/opt/bin/OpenRouter")).toBe("openrouter");
  });

  it("still returns 'codex' for codex commands", () => {
    expect(resolveDialect("codex")).toBe("codex");
  });

  it("still returns 'claude' for claude commands", () => {
    expect(resolveDialect("claude")).toBe("claude");
  });
});

// ── buildPromptModeArgs — openrouter dialect mirrors claude ──

describe("buildPromptModeArgs — openrouter", () => {
  const prompt = "Implement the feature";

  it("builds claude-shaped args for openrouter command", () => {
    const result = buildPromptModeArgs(
      { command: "openrouter" },
      prompt,
    );
    expect(result.command).toBe("openrouter");
    expect(result.args).toContain("-p");
    expect(result.args).toContain("--output-format");
    expect(result.args).toContain("stream-json");
    expect(result.args).toContain("--dangerously-skip-permissions");
  });

  it("includes --model when agent has a model", () => {
    const result = buildPromptModeArgs(
      { command: "openrouter", model: "anthropic/claude-sonnet-4" },
      prompt,
    );
    expect(result.args).toContain("--model");
    expect(result.args).toContain("anthropic/claude-sonnet-4");
  });
});

// ── createLineNormalizer — openrouter uses claude passthrough ──

describe("createLineNormalizer — openrouter dialect", () => {
  const normalize = createLineNormalizer("openrouter");

  it("passes through valid objects (identity like claude)", () => {
    const input = { type: "assistant", message: { content: [] } };
    expect(normalize(input)).toEqual(input);
  });

  it("returns null for non-objects", () => {
    expect(normalize(null)).toBeNull();
    expect(normalize("string")).toBeNull();
  });
});

// ── Multi-agent helpers ────────────────────────────────────

describe("openrouter multi-agent helpers", () => {
  it("OPENROUTER_AGENT_PREFIX is 'openrouter:'", () => {
    expect(OPENROUTER_AGENT_PREFIX).toBe("openrouter:");
  });

  it("openrouterAgentId builds correct ID", () => {
    expect(openrouterAgentId("default")).toBe("openrouter:default");
    expect(openrouterAgentId("my-model")).toBe("openrouter:my-model");
  });

  it("isOpenRouterAgentId detects openrouter prefixed IDs", () => {
    expect(isOpenRouterAgentId("openrouter:default")).toBe(true);
    expect(isOpenRouterAgentId("openrouter:custom-key")).toBe(true);
    expect(isOpenRouterAgentId("claude")).toBe(false);
    expect(isOpenRouterAgentId("")).toBe(false);
  });

  it("openrouterAgentKey extracts key from ID", () => {
    expect(openrouterAgentKey("openrouter:default")).toBe("default");
    expect(openrouterAgentKey("openrouter:my-model")).toBe("my-model");
  });

  it("formatOpenRouterAgentLabel uses label when provided", () => {
    expect(
      formatOpenRouterAgentLabel("key", "Custom Label", "model/id"),
    ).toBe("Custom Label");
  });

  it("formatOpenRouterAgentLabel falls back to model ID", () => {
    expect(
      formatOpenRouterAgentLabel("key", "", "anthropic/claude-sonnet-4"),
    ).toBe("OpenRouter (anthropic/claude-sonnet-4)");
  });

  it("formatOpenRouterAgentLabel falls back to key when no model", () => {
    expect(
      formatOpenRouterAgentLabel("my-agent", "", ""),
    ).toBe("OpenRouter (my-agent)");
  });
});

// ── Schema migration (openrouter.model -> openrouter.agents) ──

describe("openrouter schema migration", () => {
  it("migrates legacy single model to agents map", async () => {
    const { openrouterSettingsSchema } = await import("@/lib/schemas");
    const result = openrouterSettingsSchema.parse({
      apiKey: "sk-test",
      enabled: true,
      model: "anthropic/claude-sonnet-4",
    });
    expect(Object.keys(result.agents)).toHaveLength(1);
    expect(result.agents["default"]).toBeDefined();
    expect(result.agents["default"].model).toBe("anthropic/claude-sonnet-4");
  });

  it("does not overwrite existing agents with migration", async () => {
    const { openrouterSettingsSchema } = await import("@/lib/schemas");
    const result = openrouterSettingsSchema.parse({
      apiKey: "sk-test",
      enabled: true,
      model: "anthropic/claude-sonnet-4",
      agents: {
        custom: { model: "openai/gpt-4o", label: "GPT-4o" },
      },
    });
    expect(Object.keys(result.agents)).toHaveLength(1);
    expect(result.agents["custom"]).toBeDefined();
    expect(result.agents["custom"].model).toBe("openai/gpt-4o");
  });

  it("deduplicates openrouter.agents entries that target the same model", async () => {
    const { openrouterSettingsSchema } = await import("@/lib/schemas");
    const result = openrouterSettingsSchema.parse({
      apiKey: "sk-test",
      enabled: true,
      agents: {
        default: { model: "mistralai/devstral-small:free", label: "OpenRouter (mistralai/devstral-small:free)" },
        devmistral: { model: "mistralai/devstral-small:free", label: "Devmistral" },
      },
    });
    expect(Object.keys(result.agents)).toEqual(["default"]);
    expect(result.agents["default"].model).toBe("mistralai/devstral-small:free");
  });

  it("leaves agents empty when no legacy model", async () => {
    const { openrouterSettingsSchema } = await import("@/lib/schemas");
    const result = openrouterSettingsSchema.parse({
      apiKey: "",
      enabled: false,
    });
    expect(Object.keys(result.agents)).toHaveLength(0);
  });
});
