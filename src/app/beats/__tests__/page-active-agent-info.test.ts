import { describe, expect, it } from "vitest";
import { toActiveAgentInfo } from "../page";

describe("toActiveAgentInfo", () => {
  it("strips the agent name prefix from the model column for Claude", () => {
    expect(
      toActiveAgentInfo({
        agentCommand: "claude",
        agentName: "Claude",
        model: "claude-opus-4-6",
      }),
    ).toMatchObject({
      agentName: "Claude",
      model: "Opus",
      version: "4.6",
    });
  });

  it("keeps model families that do not duplicate the agent name", () => {
    expect(
      toActiveAgentInfo({
        agentCommand: "codex",
        agentName: "Codex",
        model: "gpt-5-codex",
      }),
    ).toMatchObject({
      agentName: "Codex",
      model: "GPT Codex",
      version: "5",
    });
  });
});
