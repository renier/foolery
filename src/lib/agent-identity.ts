export type AgentProviderId =
  | "claude"
  | "openai"
  | "gemini"
  | "openrouter"
  | "unknown";

export interface AgentIdentityLike {
  command?: string;
  provider?: string;
  model?: string;
  version?: string;
  label?: string;
}

const PROVIDER_LABELS: Record<Exclude<AgentProviderId, "unknown">, string> = {
  claude: "Claude",
  openai: "OpenAI",
  gemini: "Gemini",
  openrouter: "OpenRouter",
};

const MODEL_LABELS: Record<string, string> = {
  codex: "Codex",
  chatgpt: "ChatGPT",
  opus: "Opus",
  sonnet: "Sonnet",
  haiku: "Haiku",
  gemini: "Gemini",
};

function cleanValue(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function detectAgentProviderId(command?: string): AgentProviderId {
  const lower = command?.trim().toLowerCase() ?? "";
  if (!lower) return "unknown";
  if (lower.includes("openrouter")) return "openrouter";
  if (lower.includes("claude")) return "claude";
  if (
    lower.includes("codex") ||
    lower.includes("chatgpt") ||
    lower.includes("openai")
  ) {
    return "openai";
  }
  if (lower.includes("gemini")) return "gemini";
  return "unknown";
}

export function providerLabel(provider?: string, command?: string): string | undefined {
  const cleaned = cleanValue(provider);
  if (cleaned) return cleaned;
  const detected = detectAgentProviderId(command);
  if (detected === "unknown") return undefined;
  return PROVIDER_LABELS[detected];
}

function normalizeCodexModel(rawModel?: string): { model?: string; version?: string } {
  const cleaned = cleanValue(rawModel)?.toLowerCase();
  if (!cleaned) return { model: "codex" };
  if (
    !cleaned.includes("gpt") &&
    !cleaned.includes("chatgpt") &&
    !cleaned.includes("codex")
  ) {
    return { model: rawModel?.trim() };
  }
  const versionMatch = cleaned.match(/(?:gpt|chatgpt)-?(\d+(?:\.\d+)*)/i);
  return {
    model: cleaned.includes("chatgpt") ? "chatgpt" : "codex",
    ...(versionMatch?.[1] ? { version: versionMatch[1] } : {}),
  };
}

function normalizeClaudeModel(rawModel?: string): { model?: string; version?: string } {
  const cleaned = cleanValue(rawModel)?.toLowerCase();
  if (!cleaned) return {};

  const familyMatch = cleaned.match(/(opus|sonnet|haiku)/i);
  const versionMatch = cleaned.match(/(?:opus|sonnet|haiku)[- ](\d+(?:[-.]\d+)*)/i);
  const normalizedVersion = versionMatch?.[1]?.replace(/-/g, ".");

  return {
    ...(familyMatch?.[1] ? { model: familyMatch[1].toLowerCase() } : {}),
    ...(normalizedVersion ? { version: normalizedVersion } : {}),
  };
}

function normalizeGeminiModel(rawModel?: string): { model?: string; version?: string } {
  const cleaned = cleanValue(rawModel)?.toLowerCase();
  if (!cleaned) return { model: "gemini" };
  const versionMatch = cleaned.match(/gemini[- ](\d+(?:\.\d+)*)/i);
  return {
    model: "gemini",
    ...(versionMatch?.[1] ? { version: versionMatch[1] } : {}),
  };
}

export function normalizeAgentIdentity(agent: AgentIdentityLike): {
  provider?: string;
  model?: string;
  version?: string;
} {
  const provider = providerLabel(agent.provider, agent.command);
  const version = cleanValue(agent.version);
  if (provider === "OpenAI") {
    const normalized = normalizeCodexModel(agent.model);
    return {
      provider,
      ...(normalized.model ? { model: normalized.model } : {}),
      ...(version ?? normalized.version ? { version: version ?? normalized.version } : {}),
    };
  }
  if (provider === "Claude") {
    const normalized = normalizeClaudeModel(agent.model);
    return {
      provider,
      ...(normalized.model ? { model: normalized.model } : {}),
      ...(version ?? normalized.version ? { version: version ?? normalized.version } : {}),
    };
  }
  if (provider === "Gemini") {
    const normalized = normalizeGeminiModel(agent.model);
    return {
      provider,
      ...(normalized.model ? { model: normalized.model } : {}),
      ...(version ?? normalized.version ? { version: version ?? normalized.version } : {}),
    };
  }
  return {
    ...(provider ? { provider } : {}),
    ...(cleanValue(agent.model) ? { model: cleanValue(agent.model) } : {}),
    ...(version ? { version } : {}),
  };
}

export function agentDisplayName(agent: AgentIdentityLike): string {
  return (
    providerLabel(agent.provider, agent.command) ??
    cleanValue(agent.label) ??
    cleanValue(agent.command) ??
    "Unknown"
  );
}

export function formatModelDisplay(model?: string): string | undefined {
  const cleaned = cleanValue(model);
  if (!cleaned) return undefined;
  const lower = cleaned.toLowerCase();
  return MODEL_LABELS[lower] ?? cleaned;
}
