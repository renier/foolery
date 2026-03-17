import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { createLineNormalizer } from "@/lib/agent-adapter";
import { scanForAgents } from "@/lib/settings";

const execFileAsync = promisify(execFile);
const runSmoke = process.env.RUN_CRUSH_SMOKE === "1";
const smokeDescribe = runSmoke ? describe : describe.skip;

async function runCrush(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("crush", args, {
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout.toString();
}

smokeDescribe("crush smoke tests", () => {
  it("returns machine-readable JSON output", async () => {
    const stdout = await runCrush([
      "run",
      "-o",
      "json",
      "--quiet",
      "Reply with just the word hello",
    ]);
    const parsed = JSON.parse(stdout) as {
      result?: { content?: string };
      execution?: { is_error?: boolean };
      usage?: { input_tokens?: number; output_tokens?: number; cost_estimate?: number };
    };

    expect(parsed.result?.content).toBe("hello");
    expect(parsed.execution?.is_error).toBe(false);
    expect(parsed.usage?.input_tokens).toBeTypeOf("number");
    expect(parsed.usage?.output_tokens).toBeTypeOf("number");
    expect(parsed.usage?.cost_estimate).toBeTypeOf("number");
  }, 120_000);

  it("streams Crush JSONL through the adapter normalizer", async () => {
    const stdout = await runCrush([
      "run",
      "-o",
      "stream-json",
      "--quiet",
      "Reply with just the word hello",
    ]);

    const normalize = createLineNormalizer("crush");
    let lastResult:
      | { type?: string; result?: string; is_error?: boolean; duration_ms?: number; cost_usd?: number }
      | undefined;

    for (const line of stdout.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parsed = JSON.parse(trimmed);
      const normalized = normalize(parsed);
      if (normalized?.type === "result") {
        lastResult = normalized as typeof lastResult;
      }
    }

    expect(lastResult?.result).toBe("hello");
    expect(lastResult?.is_error).toBe(false);
    expect(lastResult?.duration_ms).toBeTypeOf("number");
    expect(lastResult?.cost_usd).toBeTypeOf("number");
  }, 120_000);

  it("discovers Crush as an installed agent", async () => {
    const agents = await scanForAgents();
    const crush = agents.find((agent) => agent.id === "crush");

    expect(crush).toBeDefined();
    expect(crush?.installed).toBe(true);
    expect(crush?.command).toBe("crush");
    expect(crush?.options?.length).toBeGreaterThan(0);
  }, 120_000);
});
