import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const tempPaths: string[] = [];

async function makeTempDir(prefix: string) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempPaths.push(dir);
  return dir;
}

async function buildCli() {
  const buildDir = await makeTempDir("foolery-cli-");
  const cliPath = join(buildDir, "foolery");

  await execFileAsync("bash", ["scripts/build-cli.sh", cliPath], {
    cwd: process.cwd(),
    env: { ...process.env, NO_COLOR: "1", TERM: "dumb" },
  });

  return cliPath;
}

afterAll(async () => {
  await Promise.all(
    tempPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("foolery prompt command removal", () => {
  it("rejects the retired prompt subcommand", async () => {
    const cliPath = await buildCli();

    await expect(
      execFileAsync(cliPath, ["prompt"], {
        env: { ...process.env, NO_COLOR: "1", TERM: "dumb" },
      }),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("Unknown command: prompt"),
    });
  });
});
