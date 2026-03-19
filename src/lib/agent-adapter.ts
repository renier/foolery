/**
 * Agent adapter — encapsulates CLI dialect differences between agent CLIs.
 *
 * Four responsibilities:
 *   1. Dialect resolution  — detect agent CLI type from command name
 *   2. Arg building        — construct correct CLI args per dialect
 *   3. Event normalization — convert JSONL events to the Claude shapes
 *                            that orchestration/breakdown parsers expect
 *   4. Event parsing       — convert JSONL events to human-readable
 *                            terminal display text (ANSI-colored)
 */

import type { RegisteredAgent } from "@/lib/types";
import type { AgentTarget } from "@/lib/types-agent-target";

// ── Types ───────────────────────────────────────────────────

export type AgentDialect = "claude" | "codex" | "opencode" | "crush";

export interface PromptModeArgs {
  command: string;
  args: string[];
}

// ── 1) Dialect resolution ───────────────────────────────────

/**
 * Determine CLI dialect from a command string.
 * Any path or name containing "codex" or "chatgpt" → codex;
 * "opencode" → opencode; "crush" → crush; everything else → claude.
 */
export function resolveDialect(command: string): AgentDialect {
  const base = command.includes("/")
    ? command.slice(command.lastIndexOf("/") + 1)
    : command;
  const lower = base.toLowerCase();
  if (lower.includes("crush")) return "crush";
  if (lower.includes("opencode")) return "opencode";
  if (lower.includes("codex") || lower.includes("chatgpt")) return "codex";
  return "claude";
}

// ── 2) Arg building ────────────────────────────────────────

/**
 * Build CLI args for a one-shot prompt invocation (orchestration / breakdown).
 *
 * | Concern            | Claude                                    | Codex                                         | OpenCode                  | Crush                               |
 * |--------------------|-------------------------------------------|-----------------------------------------------|---------------------------|-------------------------------------|
 * | Subcommand         | (none)                                    | exec                                          | run                       | run                                 |
 * | Prompt             | -p <prompt>                               | positional arg after exec                     | positional arg after run  | positional arg after run            |
 * | JSONL output       | --output-format stream-json               | --json                                        | --format json             | -o stream-json                      |
 * | Skip approvals     | --dangerously-skip-permissions            | --dangerously-bypass-approvals-and-sandbox    | (not needed)              | (not needed; run is already non-tty) |
 * | Model              | --model <m>                               | -m <m>                                        | -m <m>                    | -m <m>                              |
 */
export function buildPromptModeArgs(
  agent: RegisteredAgent | AgentTarget,
  prompt: string,
): PromptModeArgs {
  const command = "command" in agent && typeof agent.command === "string"
    ? agent.command
    : "claude";
  const dialect = resolveDialect(command);

  if (dialect === "opencode") {
    const args = ["run", "--format", "json"];
    if (agent.model) args.push("-m", agent.model);
    args.push(prompt);
    return { command, args };
  }

  if (dialect === "crush") {
    const args = ["run", "-o", "stream-json", "-q"];
    if (agent.model) args.push("-m", agent.model);
    args.push(prompt);
    return { command, args };
  }

  if (dialect === "codex") {
    const args = [
      "exec",
      prompt,
      "--json",
      "--dangerously-bypass-approvals-and-sandbox",
    ];
    if (agent.model) args.push("-m", agent.model);
    return { command, args };
  }

  // claude dialect
  const args = [
    "-p",
    prompt,
    "--input-format",
    "text",
    "--output-format",
    "stream-json",
    "--include-partial-messages",
    "--verbose",
    "--dangerously-skip-permissions",
  ];
  if (agent.model) args.push("--model", agent.model);
  return { command, args };
}

// ── 3) Event normalization ──────────────────────────────────

/**
 * Returns a function that normalizes a single parsed JSON line from the agent's
 * JSONL stream into the Claude-shaped event the existing parsers expect.
 *
 * For "claude" dialect the normalizer is identity (passthrough).
 * For "codex" dialect the normalizer maps Codex events → Claude shapes.
 * For "opencode" dialect the normalizer maps OpenCode JSON events → Claude shapes.
 * For "crush" dialect the normalizer maps Crush JSONL events → Claude shapes.
 *
 * Returns `null` for events that should be skipped.
 */
export function createLineNormalizer(
  dialect: AgentDialect,
): (parsed: unknown) => Record<string, unknown> | null {
  if (dialect === "claude") {
    return (parsed) => {
      if (!parsed || typeof parsed !== "object") return null;
      return parsed as Record<string, unknown>;
    };
  }

  if (dialect === "opencode") {
    let accumulatedText = "";

    return (parsed) => {
      if (!parsed || typeof parsed !== "object") return null;
      const obj = parsed as Record<string, unknown>;
      const type = obj.type;

      if (type === "step_start") return null;

      if (type === "text") {
        const part = obj.part as Record<string, unknown> | undefined;
        const text = typeof part?.text === "string" ? part.text : "";
        if (!text) return null;
        accumulatedText += text;
        return {
          type: "stream_event",
          event: {
            type: "content_block_delta",
            delta: { type: "text_delta", text },
          },
        };
      }

      if (type === "step_finish") {
        const part = obj.part as Record<string, unknown> | undefined;
        const reason = typeof part?.reason === "string" ? part.reason : "";
        const costUsd =
          typeof part?.cost === "number" ? part.cost : undefined;
        const tokens = part?.tokens as Record<string, unknown> | undefined;
        return {
          type: "result",
          result: accumulatedText,
          is_error: reason === "error",
          ...(costUsd !== undefined ? { cost_usd: costUsd } : {}),
          ...(typeof tokens?.input === "number"
            ? { input_tokens: tokens.input }
            : {}),
          ...(typeof tokens?.output === "number"
            ? { output_tokens: tokens.output }
            : {}),
        };
      }

      if (type === "error") {
        const error = obj.error as Record<string, unknown> | undefined;
        const data = error?.data as Record<string, unknown> | undefined;
        const msg =
          typeof data?.message === "string"
            ? data.message
            : typeof error?.name === "string"
              ? error.name
              : "Unknown error";
        return {
          type: "result",
          result: msg,
          is_error: true,
        };
      }

      return null;
    };
  }

  if (dialect === "crush") {
    let accumulatedText = "";

    return (parsed) => {
      if (!parsed || typeof parsed !== "object") return null;
      const obj = parsed as Record<string, unknown>;
      const type = obj.type;

      if (type === "init") return null;

      if (type === "content") {
        const text = typeof obj.content === "string" ? obj.content : "";
        if (!text) return null;
        accumulatedText += text;
        return {
          type: "stream_event",
          event: {
            type: "content_block_delta",
            delta: { type: "text_delta", text },
          },
        };
      }

      if (type === "result") {
        const usage = obj.usage as Record<string, unknown> | undefined;
        const durationMs =
          typeof obj.duration_ms === "number" ? obj.duration_ms : undefined;
        const costUsd =
          typeof usage?.cost_estimate === "number" ? usage.cost_estimate : undefined;
        return {
          type: "result",
          result: accumulatedText,
          is_error: Boolean(obj.is_error),
          ...(durationMs !== undefined ? { duration_ms: durationMs } : {}),
          ...(costUsd !== undefined ? { cost_usd: costUsd } : {}),
          ...(typeof usage?.input_tokens === "number"
            ? { input_tokens: usage.input_tokens }
            : {}),
          ...(typeof usage?.output_tokens === "number"
            ? { output_tokens: usage.output_tokens }
            : {}),
        };
      }

      if (type === "error") {
        const msg =
          typeof obj.message === "string" ? obj.message : "Unknown error";
        return {
          type: "result",
          result: msg,
          is_error: true,
        };
      }

      return null;
    };
  }

  // codex normalizer — accumulates text across item.completed events
  let accumulatedText = "";

  return (parsed) => {
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as Record<string, unknown>;
    const type = obj.type;

    // Skip structural events
    if (type === "thread.started" || type === "turn.started") {
      return null;
    }

    if (type === "item.completed") {
      const item = obj.item as Record<string, unknown> | undefined;
      if (!item) return null;

      if (item.type === "agent_message") {
        const text = typeof item.text === "string" ? item.text : "";
        accumulatedText += (accumulatedText ? "\n" : "") + text;
        return {
          type: "assistant",
          message: {
            content: [{ type: "text", text }],
          },
        };
      }

      if (item.type === "reasoning") {
        const text = typeof item.text === "string" ? item.text : "";
        return {
          type: "stream_event",
          event: {
            type: "content_block_delta",
            delta: { type: "text_delta", text },
          },
        };
      }

      if (item.type === "command_execution") {
        const output =
          typeof item.aggregated_output === "string"
            ? item.aggregated_output
            : "";
        return {
          type: "user",
          message: {
            content: [{ type: "tool_result", content: output }],
          },
        };
      }

      return null;
    }

    if (type === "item.started") {
      const item = obj.item as Record<string, unknown> | undefined;
      if (item?.type === "command_execution") {
        const cmd = typeof item.command === "string" ? item.command : "";
        return {
          type: "stream_event",
          event: {
            type: "content_block_delta",
            delta: { type: "text_delta", text: `[executing] ${cmd}\n` },
          },
        };
      }
      return null;
    }

    if (type === "turn.completed") {
      return {
        type: "result",
        result: accumulatedText,
        is_error: false,
      };
    }

    if (type === "turn.failed") {
      const error = obj.error as Record<string, unknown> | undefined;
      const msg =
        typeof error?.message === "string" ? error.message : "Turn failed";
      return {
        type: "result",
        result: msg,
        is_error: true,
      };
    }

    if (type === "error") {
      const msg =
        typeof obj.message === "string" ? obj.message : "Unknown error";
      return {
        type: "result",
        result: msg,
        is_error: true,
      };
    }

    // Unknown event type — skip
    return null;
  };
}

// ── 4) Event parsing (terminal display) ─────────────────────

// ANSI helpers
const MAGENTA = "\x1b[35m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[90m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

function abbreviate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}

/**
 * Returns a function that parses a raw NDJSON event from the agent
 * into human-readable ANSI-colored terminal display text.
 *
 * Unlike the normalizer (which translates to Claude-shaped events for
 * orchestration/breakdown logic), the parser produces display output
 * directly from each agent's native event structure.  It is used
 * exclusively by the terminal/messages pane.
 *
 * Returns `null` for events that should not be displayed.
 */
export function createLineParser(
  dialect: AgentDialect,
): (parsed: unknown) => string | null {
  if (dialect === "opencode") return createOpenCodeParser();
  if (dialect === "crush") return createCrushParser();
  // claude and codex: return null to fall through to formatStreamEvent.
  return () => null;
}

// ── OpenCode parser ─────────────────────────────────────────

function createOpenCodeParser(): (parsed: unknown) => string | null {
  let stepCount = 0;

  return (parsed) => {
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as Record<string, unknown>;
    const type = obj.type;

    if (type === "step_start") {
      stepCount++;
      return `${DIM}── step ${stepCount} ──${RESET}\n`;
    }

    if (type === "text") {
      const part = obj.part as Record<string, unknown> | undefined;
      const text = typeof part?.text === "string" ? part.text : "";
      if (!text) return null;
      return text;
    }

    if (type === "tool_use") {
      return formatOpenCodeToolUse(obj);
    }

    if (type === "step_finish") {
      return formatOpenCodeStepFinish(obj);
    }

    if (type === "error") {
      const error = obj.error as Record<string, unknown> | undefined;
      const data = error?.data as Record<string, unknown> | undefined;
      const msg =
        typeof data?.message === "string"
          ? data.message
          : typeof error?.name === "string"
            ? error.name
            : "Unknown error";
      return `${RED}error: ${msg}${RESET}\n`;
    }

    return null;
  };
}

function formatOpenCodeToolUse(obj: Record<string, unknown>): string | null {
  const part = obj.part as Record<string, unknown> | undefined;
  if (!part) return null;
  const toolName = typeof part.tool === "string" ? part.tool : "unknown";
  const state = part.state as Record<string, unknown> | undefined;
  const input = state?.input as Record<string, unknown> | undefined;
  const status = typeof state?.status === "string" ? state.status : "";

  // Build a concise input summary depending on the tool
  let inputSummary = "";
  if (input) {
    if (typeof input.command === "string") {
      inputSummary = abbreviate(input.command, 120);
    } else if (typeof input.pattern === "string") {
      inputSummary = input.pattern;
    } else if (typeof input.filePath === "string") {
      inputSummary = String(input.filePath);
    } else if (typeof input.file === "string") {
      inputSummary = String(input.file);
    } else if (typeof input.query === "string") {
      inputSummary = abbreviate(input.query, 100);
    } else if (typeof input.prompt === "string") {
      inputSummary = abbreviate(input.prompt, 100);
    } else if (typeof input.description === "string") {
      inputSummary = abbreviate(input.description, 100);
    } else if (typeof input.url === "string") {
      inputSummary = abbreviate(input.url, 100);
    }
  }

  const parts: string[] = [];
  parts.push(`${CYAN}▶ ${toolName}${inputSummary ? " " + inputSummary : ""}${RESET}\n`);

  // Show abbreviated output for completed tools
  if (status === "completed" && state) {
    const output = typeof state.output === "string" ? state.output : "";
    if (output) {
      const preview = abbreviate(output.trim(), 300);
      parts.push(`${DIM}  ${preview.replace(/\n/g, "\n  ")}${RESET}\n`);
    }
  }

  return parts.join("");
}

function formatOpenCodeStepFinish(obj: Record<string, unknown>): string | null {
  const part = obj.part as Record<string, unknown> | undefined;
  if (!part) return null;
  const costUsd = typeof part.cost === "number" ? part.cost : undefined;
  const tokens = part.tokens as Record<string, unknown> | undefined;
  const reason = typeof part.reason === "string" ? part.reason : "";

  const meta: string[] = [];
  if (costUsd !== undefined) meta.push(`$${costUsd.toFixed(4)}`);
  if (typeof tokens?.input === "number") meta.push(`in:${tokens.input}`);
  if (typeof tokens?.output === "number") meta.push(`out:${tokens.output}`);
  if (reason === "error") meta.push("error");

  if (meta.length === 0) return null;
  return `${DIM}  (${meta.join(", ")})${RESET}\n`;
}

// ── Crush parser ────────────────────────────────────────────

function createCrushParser(): (parsed: unknown) => string | null {
  return (parsed) => {
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as Record<string, unknown>;
    const type = obj.type;

    if (type === "init") return null;

    if (type === "content") {
      const text = typeof obj.content === "string" ? obj.content : "";
      if (!text) return null;
      return text;
    }

    if (type === "result") {
      return formatCrushResult(obj);
    }

    if (type === "error") {
      const msg =
        typeof obj.message === "string" ? obj.message : "Unknown error";
      return `${RED}error: ${msg}${RESET}\n`;
    }

    // Unknown event — format as ad-hoc if it has a recognizable shape
    const eventName = typeof obj.type === "string" ? obj.type : null;
    if (eventName) {
      const text =
        typeof obj.text === "string"
          ? obj.text
          : typeof obj.message === "string"
            ? obj.message
            : "";
      return `${MAGENTA}${eventName}${RESET} ${DIM}|${RESET} ${text || "(no text)"}\n`;
    }

    return null;
  };
}

function formatCrushResult(obj: Record<string, unknown>): string | null {
  const usage = obj.usage as Record<string, unknown> | undefined;
  const durationMs =
    typeof obj.duration_ms === "number" ? obj.duration_ms : undefined;
  const costUsd =
    typeof usage?.cost_estimate === "number" ? usage.cost_estimate : undefined;
  const isError = Boolean(obj.is_error);

  const meta: string[] = [];
  if (isError) meta.push("error");
  if (costUsd !== undefined) meta.push(`$${costUsd.toFixed(4)}`);
  if (durationMs !== undefined) meta.push(`${(durationMs / 1000).toFixed(1)}s`);
  if (typeof usage?.input_tokens === "number") meta.push(`in:${usage.input_tokens}`);
  if (typeof usage?.output_tokens === "number") meta.push(`out:${usage.output_tokens}`);

  if (meta.length === 0) return null;
  return `${DIM}  (${meta.join(", ")})${RESET}\n`;
}
