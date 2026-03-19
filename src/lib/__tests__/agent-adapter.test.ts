import { describe, it, expect } from "vitest";
import {
  resolveDialect,
  buildPromptModeArgs,
  createLineNormalizer,
  createLineParser,
} from "@/lib/agent-adapter";

describe("resolveDialect", () => {
  it("returns 'codex' for bare command 'codex'", () => {
    expect(resolveDialect("codex")).toBe("codex");
  });

  it("returns 'codex' for full path to codex binary", () => {
    expect(resolveDialect("/usr/local/bin/codex")).toBe("codex");
  });

  it("returns 'codex' for mixed-case path", () => {
    expect(resolveDialect("/opt/Codex/bin/codex")).toBe("codex");
  });

  it("returns 'codex' for bare command 'chatgpt'", () => {
    expect(resolveDialect("chatgpt")).toBe("codex");
  });

  it("returns 'codex' for full path to chatgpt binary", () => {
    expect(resolveDialect("/usr/local/bin/chatgpt")).toBe("codex");
  });

  it("returns 'claude' for bare command 'claude'", () => {
    expect(resolveDialect("claude")).toBe("claude");
  });

  it("returns 'claude' for full path to claude binary", () => {
    expect(resolveDialect("/usr/local/bin/claude")).toBe("claude");
  });

  it("returns 'crush' for bare command 'crush'", () => {
    expect(resolveDialect("crush")).toBe("crush");
  });

  it("returns 'crush' for full path to crush binary", () => {
    expect(resolveDialect("/opt/homebrew/bin/crush")).toBe("crush");
  });

  it("returns 'claude' for unknown commands (default)", () => {
    expect(resolveDialect("my-custom-agent")).toBe("claude");
  });
});

describe("buildPromptModeArgs", () => {
  const prompt = "Do something";

  it("builds correct claude args without model", () => {
    const result = buildPromptModeArgs({ command: "claude" }, prompt);
    expect(result.command).toBe("claude");
    expect(result.args).toEqual([
      "-p",
      prompt,
      "--input-format",
      "text",
      "--output-format",
      "stream-json",
      "--include-partial-messages",
      "--verbose",
      "--dangerously-skip-permissions",
    ]);
  });

  it("builds correct claude args with model", () => {
    const result = buildPromptModeArgs(
      { command: "claude", model: "sonnet" },
      prompt,
    );
    expect(result.args).toContain("--model");
    expect(result.args).toContain("sonnet");
    // --model should come after --dangerously-skip-permissions
    const modelIdx = result.args.indexOf("--model");
    expect(result.args[modelIdx + 1]).toBe("sonnet");
  });

  it("builds correct codex args without model", () => {
    const result = buildPromptModeArgs({ command: "codex" }, prompt);
    expect(result.command).toBe("codex");
    expect(result.args).toEqual([
      "exec",
      prompt,
      "--json",
      "--dangerously-bypass-approvals-and-sandbox",
    ]);
  });

  it("builds correct codex args with model", () => {
    const result = buildPromptModeArgs(
      { command: "codex", model: "o3" },
      prompt,
    );
    expect(result.args).toContain("-m");
    expect(result.args).toContain("o3");
    const mIdx = result.args.indexOf("-m");
    expect(result.args[mIdx + 1]).toBe("o3");
  });

  it("detects codex from absolute path", () => {
    const result = buildPromptModeArgs(
      { command: "/usr/local/bin/codex" },
      prompt,
    );
    expect(result.args[0]).toBe("exec");
  });

  it("builds correct crush args without model", () => {
    const result = buildPromptModeArgs({ command: "crush" }, prompt);
    expect(result.command).toBe("crush");
    expect(result.args).toEqual([
      "run",
      "-o",
      "stream-json",
      "-q",
      prompt,
    ]);
  });

  it("builds correct crush args with model", () => {
    const result = buildPromptModeArgs(
      { command: "crush", model: "bedrock/anthropic.claude-opus-4-6-v1" },
      prompt,
    );
    expect(result.args).toEqual([
      "run",
      "-o",
      "stream-json",
      "-q",
      "-m",
      "bedrock/anthropic.claude-opus-4-6-v1",
      prompt,
    ]);
  });
});

describe("createLineNormalizer — claude dialect", () => {
  const normalize = createLineNormalizer("claude");

  it("passes through valid objects", () => {
    const input = { type: "assistant", message: { content: [] } };
    expect(normalize(input)).toEqual(input);
  });

  it("returns null for non-objects", () => {
    expect(normalize(null)).toBeNull();
    expect(normalize("string")).toBeNull();
    expect(normalize(42)).toBeNull();
  });
});

describe("createLineNormalizer — opencode dialect", () => {
  it("skips step_start events", () => {
    const normalize = createLineNormalizer("opencode");
    expect(
      normalize({
        type: "step_start",
        timestamp: 1700000000000,
        sessionID: "ses_abc",
        part: { type: "step-start", snapshot: "abc123" },
      }),
    ).toBeNull();
  });

  it("skips text events with empty text", () => {
    const normalize = createLineNormalizer("opencode");
    expect(
      normalize({
        type: "text",
        timestamp: 1700000000000,
        sessionID: "ses_abc",
        part: { type: "text", text: "" },
      }),
    ).toBeNull();
  });

  it("normalizes text events to stream_event content_block_delta", () => {
    const normalize = createLineNormalizer("opencode");
    expect(
      normalize({
        type: "text",
        timestamp: 1700000000000,
        sessionID: "ses_abc",
        part: { type: "text", text: "hello world" },
      }),
    ).toEqual({
      type: "stream_event",
      event: {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "hello world" },
      },
    });
  });

  it("accumulates text and returns it in step_finish result", () => {
    const normalize = createLineNormalizer("opencode");
    normalize({
      type: "text",
      timestamp: 1700000000000,
      sessionID: "ses_abc",
      part: { type: "text", text: "first" },
    });
    normalize({
      type: "text",
      timestamp: 1700000000001,
      sessionID: "ses_abc",
      part: { type: "text", text: " second" },
    });
    const result = normalize({
      type: "step_finish",
      timestamp: 1700000000002,
      sessionID: "ses_abc",
      part: { type: "step-finish", reason: "stop" },
    });
    expect(result).toMatchObject({
      type: "result",
      result: "first second",
      is_error: false,
    });
  });

  it("extracts cost and token usage from step_finish", () => {
    const normalize = createLineNormalizer("opencode");
    normalize({
      type: "text",
      timestamp: 1700000000000,
      sessionID: "ses_abc",
      part: { type: "text", text: "hello" },
    });
    const result = normalize({
      type: "step_finish",
      timestamp: 1700000000100,
      sessionID: "ses_abc",
      part: {
        type: "step-finish",
        reason: "stop",
        cost: 0.11172875,
        tokens: {
          total: 17865,
          input: 2,
          output: 4,
          reasoning: 0,
          cache: { read: 0, write: 17859 },
        },
      },
    });
    expect(result).toMatchObject({
      type: "result",
      result: "hello",
      is_error: false,
      cost_usd: 0.11172875,
      input_tokens: 2,
      output_tokens: 4,
    });
  });

  it("marks step_finish with reason 'error' as is_error", () => {
    const normalize = createLineNormalizer("opencode");
    const result = normalize({
      type: "step_finish",
      timestamp: 1700000000000,
      sessionID: "ses_abc",
      part: { type: "step-finish", reason: "error" },
    });
    expect(result).toMatchObject({
      type: "result",
      result: "",
      is_error: true,
    });
  });

  it("normalizes error events to result errors using data.message", () => {
    const normalize = createLineNormalizer("opencode");
    expect(
      normalize({
        type: "error",
        timestamp: 1700000000000,
        sessionID: "ses_abc",
        error: {
          name: "UnknownError",
          data: { message: "Model not found: nonexistent/fake-model-xyz." },
        },
      }),
    ).toEqual({
      type: "result",
      result: "Model not found: nonexistent/fake-model-xyz.",
      is_error: true,
    });
  });

  it("falls back to error.name when data.message is missing", () => {
    const normalize = createLineNormalizer("opencode");
    expect(
      normalize({
        type: "error",
        timestamp: 1700000000000,
        sessionID: "ses_abc",
        error: { name: "AuthenticationError" },
      }),
    ).toEqual({
      type: "result",
      result: "AuthenticationError",
      is_error: true,
    });
  });

  it("returns null for unknown event types", () => {
    const normalize = createLineNormalizer("opencode");
    expect(normalize({ type: "something.unknown" })).toBeNull();
  });
});

describe("createLineNormalizer — codex dialect", () => {
  it("skips thread.started and turn.started", () => {
    const normalize = createLineNormalizer("codex");
    expect(normalize({ type: "thread.started", thread_id: "t1" })).toBeNull();
    expect(normalize({ type: "turn.started" })).toBeNull();
  });

  it("normalizes agent_message to assistant event", () => {
    const normalize = createLineNormalizer("codex");
    const result = normalize({
      type: "item.completed",
      item: { id: "item_1", type: "agent_message", text: "Hello world" },
    });
    expect(result).toEqual({
      type: "assistant",
      message: {
        content: [{ type: "text", text: "Hello world" }],
      },
    });
  });

  it("normalizes reasoning to stream_event delta", () => {
    const normalize = createLineNormalizer("codex");
    const result = normalize({
      type: "item.completed",
      item: { id: "item_0", type: "reasoning", text: "Thinking..." },
    });
    expect(result).toEqual({
      type: "stream_event",
      event: {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "Thinking..." },
      },
    });
  });

  it("normalizes command_execution item.started to stream_event", () => {
    const normalize = createLineNormalizer("codex");
    const result = normalize({
      type: "item.started",
      item: {
        id: "item_2",
        type: "command_execution",
        command: "ls -la",
        status: "in_progress",
      },
    });
    expect(result).toEqual({
      type: "stream_event",
      event: {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "[executing] ls -la\n" },
      },
    });
  });

  it("normalizes command_execution item.completed to user/tool_result", () => {
    const normalize = createLineNormalizer("codex");
    const result = normalize({
      type: "item.completed",
      item: {
        id: "item_2",
        type: "command_execution",
        command: "ls -la",
        aggregated_output: "file1\nfile2",
        exit_code: 0,
        status: "completed",
      },
    });
    expect(result).toEqual({
      type: "user",
      message: {
        content: [{ type: "tool_result", content: "file1\nfile2" }],
      },
    });
  });

  it("normalizes turn.completed to result event with accumulated text", () => {
    const normalize = createLineNormalizer("codex");
    // First, send an agent_message to accumulate text
    normalize({
      type: "item.completed",
      item: { id: "item_1", type: "agent_message", text: "Done!" },
    });
    const result = normalize({
      type: "turn.completed",
      usage: { input_tokens: 100, output_tokens: 50 },
    });
    expect(result).toEqual({
      type: "result",
      result: "Done!",
      is_error: false,
    });
  });

  it("normalizes turn.failed to error result", () => {
    const normalize = createLineNormalizer("codex");
    const result = normalize({
      type: "turn.failed",
      error: { message: "Rate limit exceeded" },
    });
    expect(result).toEqual({
      type: "result",
      result: "Rate limit exceeded",
      is_error: true,
    });
  });

  it("normalizes error event to error result", () => {
    const normalize = createLineNormalizer("codex");
    const result = normalize({
      type: "error",
      message: "Connection failed",
    });
    expect(result).toEqual({
      type: "result",
      result: "Connection failed",
      is_error: true,
    });
  });

  it("returns null for unknown event types", () => {
    const normalize = createLineNormalizer("codex");
    expect(normalize({ type: "something.unknown" })).toBeNull();
  });

  it("accumulates text across multiple agent_messages", () => {
    const normalize = createLineNormalizer("codex");
    normalize({
      type: "item.completed",
      item: { id: "item_1", type: "agent_message", text: "First" },
    });
    normalize({
      type: "item.completed",
      item: { id: "item_2", type: "agent_message", text: "Second" },
    });
    const result = normalize({ type: "turn.completed", usage: {} });
    expect(result).toEqual({
      type: "result",
      result: "First\nSecond",
      is_error: false,
    });
  });
});

describe("createLineNormalizer — crush dialect", () => {
  it("skips init and empty content events", () => {
    const normalize = createLineNormalizer("crush");
    expect(
      normalize({
        type: "init",
        session_id: "session-1",
        model: { name: "AWS Claude Opus 4.6" },
      }),
    ).toBeNull();
    expect(normalize({ type: "content" })).toBeNull();
  });

  it("normalizes streaming content and final result metadata", () => {
    const normalize = createLineNormalizer("crush");
    expect(
      normalize({
        type: "content",
        session_id: "session-1",
        content: "hello",
      }),
    ).toEqual({
      type: "stream_event",
      event: {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "hello" },
      },
    });
    expect(
      normalize({
        type: "content",
        session_id: "session-1",
        content: " world",
      }),
    ).toEqual({
      type: "stream_event",
      event: {
        type: "content_block_delta",
        delta: { type: "text_delta", text: " world" },
      },
    });

    expect(
      normalize({
        type: "result",
        session_id: "session-1",
        duration_ms: 1234,
        is_error: false,
        usage: {
          input_tokens: 3,
          output_tokens: 2,
          cost_estimate: 0.125,
        },
      }),
    ).toMatchObject({
      type: "result",
      result: "hello world",
      is_error: false,
      duration_ms: 1234,
      cost_usd: 0.125,
      input_tokens: 3,
      output_tokens: 2,
    });
  });

  it("normalizes error events to result errors", () => {
    const normalize = createLineNormalizer("crush");
    expect(
      normalize({
        type: "error",
        message: "Something went wrong",
      }),
    ).toEqual({
      type: "result",
      result: "Something went wrong",
      is_error: true,
    });
  });

  it("skips message_start, message_finish, tool_call, and tool_result events", () => {
    const normalize = createLineNormalizer("crush");
    expect(
      normalize({
        type: "message_start",
        session_id: "session-1",
        message_id: "msg-1",
        role: "assistant",
      }),
    ).toBeNull();
    expect(
      normalize({
        type: "message_finish",
        session_id: "session-1",
        message_id: "msg-1",
        finish_reason: "stop",
      }),
    ).toBeNull();
    expect(
      normalize({
        type: "tool_call",
        session_id: "session-1",
        tool_call: { id: "t1", name: "bash", finished: true },
      }),
    ).toBeNull();
    expect(
      normalize({
        type: "tool_result",
        session_id: "session-1",
        tool_result: { tool_call_id: "t1", name: "bash", content: "output" },
      }),
    ).toBeNull();
  });
});

// ── createLineParser tests ──────────────────────────────────

/** Strip ANSI escape codes so assertions are readable. */
function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

describe("createLineParser — claude/codex dialects return null (fallthrough)", () => {
  it("claude parser returns null for any event", () => {
    const parse = createLineParser("claude");
    expect(parse({ type: "assistant", message: { content: [] } })).toBeNull();
    expect(parse({ type: "stream_event", event: {} })).toBeNull();
    expect(parse({ type: "result", result: "done" })).toBeNull();
  });

  it("codex parser returns null for any event", () => {
    const parse = createLineParser("codex");
    expect(parse({ type: "item.completed", item: {} })).toBeNull();
    expect(parse({ type: "turn.completed" })).toBeNull();
  });
});

describe("createLineParser — opencode dialect", () => {
  it("returns null for null/non-object input", () => {
    const parse = createLineParser("opencode");
    expect(parse(null)).toBeNull();
    expect(parse("string")).toBeNull();
    expect(parse(42)).toBeNull();
  });

  it("shows step counter for step_start events", () => {
    const parse = createLineParser("opencode");
    const first = parse({
      type: "step_start",
      timestamp: 1700000000000,
      sessionID: "ses_abc",
      part: { type: "step-start", snapshot: "abc123" },
    });
    const second = parse({
      type: "step_start",
      timestamp: 1700000000100,
      sessionID: "ses_abc",
      part: { type: "step-start", snapshot: "def456" },
    });
    expect(stripAnsi(first!)).toContain("step 1");
    expect(stripAnsi(second!)).toContain("step 2");
  });

  it("returns text content with trailing newline", () => {
    const parse = createLineParser("opencode");
    const result = parse({
      type: "text",
      timestamp: 1700000000000,
      sessionID: "ses_abc",
      part: { type: "text", text: "Hello world" },
    });
    expect(result).toBe("Hello world\n");
  });

  it("does not double newline when text already ends with one", () => {
    const parse = createLineParser("opencode");
    const result = parse({
      type: "text",
      timestamp: 1700000000000,
      sessionID: "ses_abc",
      part: { type: "text", text: "Hello world\n" },
    });
    expect(result).toBe("Hello world\n");
  });

  it("returns null for text events with empty text", () => {
    const parse = createLineParser("opencode");
    expect(
      parse({
        type: "text",
        timestamp: 1700000000000,
        sessionID: "ses_abc",
        part: { type: "text", text: "" },
      }),
    ).toBe("");
  });

  it("does NOT repeat accumulated text in step_finish (only shows cost/tokens)", () => {
    const parse = createLineParser("opencode");
    // Send some text first
    parse({
      type: "text",
      timestamp: 1700000000000,
      sessionID: "ses_abc",
      part: { type: "text", text: "First step output" },
    });
    // step_finish should NOT contain the text
    const finish = parse({
      type: "step_finish",
      timestamp: 1700000000100,
      sessionID: "ses_abc",
      part: {
        type: "step-finish",
        reason: "stop",
        cost: 0.1234,
        tokens: { total: 100, input: 10, output: 20 },
      },
    });
    const plain = stripAnsi(finish!);
    expect(plain).toContain("$0.1234");
    expect(plain).toContain("in:10");
    expect(plain).toContain("out:20");
    expect(plain).not.toContain("First step output");
  });

  it("returns null for step_finish with no cost/token metadata", () => {
    const parse = createLineParser("opencode");
    const result = parse({
      type: "step_finish",
      timestamp: 1700000000000,
      sessionID: "ses_abc",
      part: { type: "step-finish", reason: "stop" },
    });
    expect(result).toBe("");
  });

  it("marks step_finish with reason error", () => {
    const parse = createLineParser("opencode");
    const result = parse({
      type: "step_finish",
      timestamp: 1700000000000,
      sessionID: "ses_abc",
      part: { type: "step-finish", reason: "error", cost: 0.01 },
    });
    expect(stripAnsi(result!)).toContain("error");
  });

  it("formats tool_use with tool name and input summary", () => {
    const parse = createLineParser("opencode");
    const result = parse({
      type: "tool_use",
      timestamp: 1700000000000,
      sessionID: "ses_abc",
      part: {
        tool: "bash",
        state: {
          status: "completed",
          input: { command: "ls -la" },
          output: "file1\nfile2\nfile3",
        },
      },
    });
    const plain = stripAnsi(result!);
    expect(plain).toContain("▶ bash");
    expect(plain).toContain("ls -la");
    expect(plain).toContain("file1");
  });

  it("formats tool_use with filePath input", () => {
    const parse = createLineParser("opencode");
    const result = parse({
      type: "tool_use",
      timestamp: 1700000000000,
      sessionID: "ses_abc",
      part: {
        tool: "read",
        state: {
          status: "completed",
          input: { filePath: "/src/main.ts" },
          output: "file contents here",
        },
      },
    });
    const plain = stripAnsi(result!);
    expect(plain).toContain("▶ read");
    expect(plain).toContain("/src/main.ts");
  });

  it("formats tool_use with pattern input (glob)", () => {
    const parse = createLineParser("opencode");
    const result = parse({
      type: "tool_use",
      timestamp: 1700000000000,
      sessionID: "ses_abc",
      part: {
        tool: "glob",
        state: {
          status: "completed",
          input: { pattern: "**/*.ts" },
          output: "file1.ts\nfile2.ts",
        },
      },
    });
    const plain = stripAnsi(result!);
    expect(plain).toContain("▶ glob");
    expect(plain).toContain("**/*.ts");
  });

  it("abbreviates long tool output", () => {
    const parse = createLineParser("opencode");
    const longOutput = "x".repeat(500);
    const result = parse({
      type: "tool_use",
      timestamp: 1700000000000,
      sessionID: "ses_abc",
      part: {
        tool: "bash",
        state: {
          status: "completed",
          input: { command: "cat big.txt" },
          output: longOutput,
        },
      },
    });
    // Output should be truncated to ~300 chars + ellipsis
    expect(result!.length).toBeLessThan(longOutput.length);
    expect(result).toContain("…");
  });

  it("returns empty string for tool_use with no part", () => {
    const parse = createLineParser("opencode");
    expect(parse({ type: "tool_use" })).toBe("");
  });

  it("omits output preview for non-completed tools", () => {
    const parse = createLineParser("opencode");
    const result = parse({
      type: "tool_use",
      timestamp: 1700000000000,
      sessionID: "ses_abc",
      part: {
        tool: "bash",
        state: {
          status: "running",
          input: { command: "sleep 10" },
        },
      },
    });
    const plain = stripAnsi(result!);
    expect(plain).toContain("▶ bash");
    expect(plain).toContain("sleep 10");
    // Should only have one line (the tool header), no output preview
    expect(plain.trim().split("\n")).toHaveLength(1);
  });

  it("formats error events", () => {
    const parse = createLineParser("opencode");
    const result = parse({
      type: "error",
      timestamp: 1700000000000,
      sessionID: "ses_abc",
      error: {
        name: "AuthError",
        data: { message: "Invalid API key" },
      },
    });
    const plain = stripAnsi(result!);
    expect(plain).toContain("error:");
    expect(plain).toContain("Invalid API key");
  });

  it("falls back to error.name when data.message is missing", () => {
    const parse = createLineParser("opencode");
    const result = parse({
      type: "error",
      error: { name: "AuthenticationError" },
    });
    expect(stripAnsi(result!)).toContain("AuthenticationError");
  });

  it("returns null for unknown event types", () => {
    const parse = createLineParser("opencode");
    expect(parse({ type: "something.unknown" })).toBeNull();
  });
});

describe("createLineParser — crush dialect", () => {
  it("returns null for null/non-object input", () => {
    const parse = createLineParser("crush");
    expect(parse(null)).toBeNull();
    expect(parse("string")).toBeNull();
  });

  it("suppresses init events", () => {
    const parse = createLineParser("crush");
    expect(
      parse({
        type: "init",
        session_id: "session-1",
        model: { name: "Claude" },
      }),
    ).toBe("");
  });

  it("returns content text directly without accumulation", () => {
    const parse = createLineParser("crush");
    expect(
      parse({
        type: "content",
        session_id: "session-1",
        content: "hello",
      }),
    ).toBe("hello");
    expect(
      parse({
        type: "content",
        session_id: "session-1",
        content: " world",
      }),
    ).toBe(" world");
  });

  it("suppresses empty content", () => {
    const parse = createLineParser("crush");
    expect(parse({ type: "content", content: "" })).toBe("");
  });

  it("does NOT repeat accumulated text in result (only shows cost/tokens)", () => {
    const parse = createLineParser("crush");
    // Stream some content first
    parse({ type: "content", content: "First output" });
    parse({ type: "content", content: " second output" });
    // Result should NOT contain the content text
    const result = parse({
      type: "result",
      session_id: "session-1",
      duration_ms: 5000,
      is_error: false,
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cost_estimate: 0.0125,
      },
    });
    const plain = stripAnsi(result!);
    expect(plain).toContain("$0.0125");
    expect(plain).toContain("5.0s");
    expect(plain).toContain("in:100");
    expect(plain).toContain("out:50");
    expect(plain).not.toContain("First output");
    expect(plain).not.toContain("second output");
  });

  it("suppresses result with no metadata", () => {
    const parse = createLineParser("crush");
    const result = parse({ type: "result", is_error: false });
    expect(result).toBe("");
  });

  it("includes error marker for error results", () => {
    const parse = createLineParser("crush");
    const result = parse({
      type: "result",
      is_error: true,
      usage: { cost_estimate: 0.01 },
    });
    expect(stripAnsi(result!)).toContain("error");
  });

  it("formats error events", () => {
    const parse = createLineParser("crush");
    const result = parse({
      type: "error",
      message: "Connection refused",
    });
    const plain = stripAnsi(result!);
    expect(plain).toContain("error:");
    expect(plain).toContain("Connection refused");
  });

  it("suppresses message_start and emits newline on message_finish", () => {
    const parse = createLineParser("crush");

    // message_start begins a message — suppressed
    expect(
      parse({
        type: "message_start",
        session_id: "session-1",
        message_id: "msg-1",
        role: "assistant",
      }),
    ).toBe("");

    // Content tokens flow without trailing newlines
    expect(parse({ type: "content", content: "Hello" })).toBe("Hello");
    expect(parse({ type: "content", content: " world" })).toBe(" world");

    // message_finish terminates the content line with a newline
    expect(
      parse({
        type: "message_finish",
        session_id: "session-1",
        message_id: "msg-1",
        finish_reason: "stop",
      }),
    ).toBe("\n");
  });

  it("message_finish without preceding message_start suppresses", () => {
    const parse = createLineParser("crush");
    expect(
      parse({
        type: "message_finish",
        session_id: "session-1",
        message_id: "msg-1",
        finish_reason: "stop",
      }),
    ).toBe("");
  });

  it("prepends newline to tool_call when content was streaming", () => {
    const parse = createLineParser("crush");
    // Start a message and stream some content
    parse({ type: "message_start", session_id: "s1", message_id: "m1", role: "assistant" });
    parse({ type: "content", content: "I'll inspect the details." });
    // tool_call arrives before message_finish
    const result = parse({
      type: "tool_call",
      session_id: "s1",
      tool_call: {
        id: "toolu_1",
        name: "bash",
        input: '{"command": "ls"}',
        finished: true,
      },
    });
    const plain = stripAnsi(result!);
    // Should start with a newline to terminate the content line
    expect(result!.startsWith("\n")).toBe(true);
    expect(plain).toContain("▶ bash");
  });

  it("formats finished tool_call with tool name and input summary", () => {
    const parse = createLineParser("crush");
    const result = parse({
      type: "tool_call",
      session_id: "session-1",
      tool_call: {
        id: "toolu_123",
        name: "bash",
        input: '{"command": "ls -la", "description": "List files"}',
        finished: true,
      },
    });
    const plain = stripAnsi(result!);
    expect(plain).toContain("▶ bash");
    expect(plain).toContain("ls -la");
  });

  it("formats tool_call with path input", () => {
    const parse = createLineParser("crush");
    const result = parse({
      type: "tool_call",
      session_id: "session-1",
      tool_call: {
        id: "toolu_456",
        name: "ls",
        input: '{"path": "/home/user/projects/flock", "depth": 2}',
        finished: true,
      },
    });
    const plain = stripAnsi(result!);
    expect(plain).toContain("▶ ls");
    expect(plain).toContain("/home/user/projects/flock");
  });

  it("suppresses unfinished tool_call events", () => {
    const parse = createLineParser("crush");
    expect(
      parse({
        type: "tool_call",
        session_id: "session-1",
        tool_call: {
          id: "toolu_789",
          name: "bash",
          finished: false,
        },
      }),
    ).toBe("");
  });

  it("suppresses tool_call with no tool_call field", () => {
    const parse = createLineParser("crush");
    expect(parse({ type: "tool_call" })).toBe("");
  });

  it("formats tool_result with content preview", () => {
    const parse = createLineParser("crush");
    const result = parse({
      type: "tool_result",
      session_id: "session-1",
      tool_result: {
        tool_call_id: "toolu_123",
        name: "bash",
        content: "file1\nfile2\nfile3",
        is_error: false,
      },
    });
    const plain = stripAnsi(result!);
    expect(plain).toContain("file1");
    expect(plain).toContain("file2");
  });

  it("formats error tool_result with error marker", () => {
    const parse = createLineParser("crush");
    const result = parse({
      type: "tool_result",
      session_id: "session-1",
      tool_result: {
        tool_call_id: "toolu_123",
        name: "bash",
        content: "command not found",
        is_error: true,
      },
    });
    const plain = stripAnsi(result!);
    expect(plain).toContain("✗");
    expect(plain).toContain("bash");
    expect(plain).toContain("command not found");
  });

  it("suppresses tool_result with no content and no error", () => {
    const parse = createLineParser("crush");
    expect(
      parse({
        type: "tool_result",
        session_id: "session-1",
        tool_result: {
          tool_call_id: "toolu_123",
          name: "bash",
          content: "",
          is_error: false,
        },
      }),
    ).toBe("");
  });

  it("returns null for unknown event types", () => {
    const parse = createLineParser("crush");
    expect(parse({ type: "something.unknown" })).toBeNull();
  });
});
