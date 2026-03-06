import { describe, it, expect, vi, beforeEach } from "vitest";

const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockMkdir = vi.fn();

vi.mock("node:fs/promises", () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  chmod: vi.fn(),
}));

const mockExecCb = vi.fn();
vi.mock("node:child_process", () => ({
  exec: (
    cmd: string,
    cb: (err: Error | null, result?: { stdout: string; stderr: string }) => void,
  ) => {
    const p = mockExecCb(cmd);
    p.then(
      (r: { stdout: string; stderr: string }) => cb(null, r),
      (e: Error) => cb(e),
    );
  },
}));

import { scanForAgents, _resetCache } from "@/lib/settings";

beforeEach(() => {
  vi.clearAllMocks();
  _resetCache();
  mockMkdir.mockResolvedValue(undefined);
  mockWriteFile.mockResolvedValue(undefined);
});

describe("scanForAgents", () => {
  it("returns installed status when an agent is found on PATH", async () => {
    mockExecCb.mockImplementation(async (cmd: string) => {
      if (cmd === "command -v claude") {
        return { stdout: "/usr/local/bin/claude\n", stderr: "" };
      }
      throw new Error("not found");
    });

    const agents = await scanForAgents();
    expect(agents).toHaveLength(3);
    expect(agents.map((agent) => agent.id)).toEqual(["claude", "codex", "gemini"]);

    const claude = agents.find((agent) => agent.id === "claude");
    expect(claude).toEqual({
      id: "claude",
      command: "claude",
      path: "/usr/local/bin/claude",
      installed: true,
      provider: "Claude",
    });
  });

  it("marks agents missing when command lookup fails", async () => {
    mockExecCb.mockRejectedValue(new Error("not found"));

    const agents = await scanForAgents();
    expect(agents).toHaveLength(3);
    for (const agent of agents) {
      expect(agent.installed).toBe(false);
      expect(agent.path).toBe("");
      expect(agent.provider).toBeTruthy();
    }
  });

  it("captures Codex model metadata from local config", async () => {
    mockExecCb.mockImplementation(async (cmd: string) => {
      if (cmd === "command -v codex") {
        return { stdout: "/opt/homebrew/bin/codex\n", stderr: "" };
      }
      throw new Error("not found");
    });
    mockReadFile.mockImplementation(async (path: string) => {
      if (path.endsWith(".codex/config.toml")) {
        return 'model = "gpt-5.4"\n';
      }
      throw new Error("missing");
    });

    const agents = await scanForAgents();
    expect(agents.find((agent) => agent.id === "codex")).toEqual({
      id: "codex",
      command: "codex",
      path: "/opt/homebrew/bin/codex",
      installed: true,
      provider: "OpenAI",
      model: "codex",
      version: "5.4",
    });
  });

  it("captures Claude model metadata from settings when available", async () => {
    mockExecCb.mockImplementation(async (cmd: string) => {
      if (cmd === "command -v claude") {
        return { stdout: "/usr/local/bin/claude\n", stderr: "" };
      }
      throw new Error("not found");
    });
    mockReadFile.mockImplementation(async (path: string) => {
      if (path.endsWith(".claude/settings.json")) {
        return JSON.stringify({ defaultModel: "claude-sonnet-4-5" });
      }
      throw new Error("missing");
    });

    const agents = await scanForAgents();
    expect(agents.find((agent) => agent.id === "claude")).toEqual({
      id: "claude",
      command: "claude",
      path: "/usr/local/bin/claude",
      installed: true,
      provider: "Claude",
      model: "sonnet",
      version: "4.5",
    });
  });
});
