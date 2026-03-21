/**
 * Git worktree management for beat branch isolation.
 *
 * When multiple beats are active on the same repository, each beat operates
 * in its own worktree with a dedicated branch to prevent conflicts.
 * The worktree is created as a sibling directory to the repository:
 *   ../<repoName>-<beatId>
 * The branch is named:
 *   <repoName>-<beatId>
 */

import { execFile } from "node:child_process";
import { basename, dirname, join } from "node:path";
import { access, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const TAG = "[git-worktree]";

// ── Path conventions ────────────────────────────────────────

const CLAUDE_WORKTREES_SEGMENT = /^(.*?)[\\/]\.claude[\\/]worktrees[\\/][^\\/]+(?:[\\/].*)?$/u;
const KNOTS_WORKTREE_SEGMENT = /^(.*?)[\\/]\.knots[\\/]_worktree(?:[\\/].*)?$/u;
const SIBLING_WORKTREE_PATTERN = /^(.*)-wt-[^\\/]+$/u;

export function trimPathSeparators(value: string): string {
  return value.replace(/[\\/]+$/u, "");
}

/**
 * Infer the canonical (main checkout) repo path from a worktree path.
 * Returns null if the path does not match any known worktree layout.
 */
export function inferCanonicalRepoPath(repoPath: string): string | null {
  const trimmed = trimPathSeparators(repoPath.trim());
  if (!trimmed) return null;

  const claudeMatch = trimmed.match(CLAUDE_WORKTREES_SEGMENT);
  if (claudeMatch?.[1]) {
    return trimPathSeparators(claudeMatch[1]);
  }

  const knotsWorktreeMatch = trimmed.match(KNOTS_WORKTREE_SEGMENT);
  if (knotsWorktreeMatch?.[1]) {
    return trimPathSeparators(knotsWorktreeMatch[1]);
  }

  const baseName = basename(trimmed);
  const siblingMatch = baseName.match(SIBLING_WORKTREE_PATTERN);
  if (siblingMatch?.[1]) {
    return trimPathSeparators(join(dirname(trimmed), siblingMatch[1]));
  }

  return null;
}

// ── Beat branch naming ──────────────────────────────────────

export function beatBranchName(repoPath: string, beatId: string): string {
  const repoName = basename(trimPathSeparators(repoPath.trim()));
  return `${repoName}-wt-${beatId}`;
}

export function beatWorktreePath(repoPath: string, beatId: string): string {
  const trimmed = trimPathSeparators(repoPath.trim());
  const canonical = inferCanonicalRepoPath(trimmed) ?? trimmed;
  const branchName = beatBranchName(canonical, beatId);
  return join(dirname(canonical), branchName);
}

// ── Worktree lifecycle ──────────────────────────────────────

export interface CreateWorktreeResult {
  ok: boolean;
  worktreePath: string;
  branchName: string;
  error?: string;
}

/**
 * Create a git worktree for a beat, branching from the current HEAD of main.
 * If the branch already exists (re-entry after rollback), reattaches it.
 */
export async function createBeatWorktree(
  repoPath: string,
  beatId: string,
): Promise<CreateWorktreeResult> {
  const canonical = inferCanonicalRepoPath(repoPath) ?? repoPath;
  const branchName = beatBranchName(canonical, beatId);
  const worktreePath = beatWorktreePath(canonical, beatId);

  try {
    const alreadyExists = await pathExists(worktreePath);
    if (alreadyExists) {
      console.log(`${TAG} worktree already exists at ${worktreePath}`);
      return { ok: true, worktreePath, branchName };
    }

    const branchExists = await gitBranchExists(canonical, branchName);

    if (branchExists) {
      console.log(`${TAG} reattaching existing branch ${branchName} at ${worktreePath}`);
      await execFileAsync("git", ["worktree", "add", worktreePath, branchName], {
        cwd: canonical,
      });
    } else {
      console.log(`${TAG} creating new worktree: branch=${branchName} path=${worktreePath}`);
      await execFileAsync(
        "git",
        ["worktree", "add", "-b", branchName, worktreePath, "HEAD"],
        { cwd: canonical },
      );
    }

    return { ok: true, worktreePath, branchName };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${TAG} failed to create worktree for ${beatId}: ${message}`);
    return { ok: false, worktreePath, branchName, error: message };
  }
}

/**
 * Remove a beat's worktree and optionally delete the branch.
 * Safe to call even if the worktree doesn't exist.
 */
export async function removeBeatWorktree(
  repoPath: string,
  beatId: string,
  options: { deleteBranch?: boolean } = {},
): Promise<void> {
  const canonical = inferCanonicalRepoPath(repoPath) ?? repoPath;
  const branchName = beatBranchName(canonical, beatId);
  const worktreePath = beatWorktreePath(canonical, beatId);

  const worktreeExists = await pathExists(worktreePath);
  if (!worktreeExists) {
    // Fast path: no worktree on disk — only clean up the branch if it exists.
    if (options.deleteBranch !== false) {
      try {
        const hasBranch = await gitBranchExists(canonical, branchName);
        if (hasBranch) {
          console.log(`${TAG} deleting orphaned branch ${branchName}`);
          await execFileAsync("git", ["branch", "-D", branchName], { cwd: canonical });
        }
      } catch {
        // Branch doesn't exist or repo is not accessible — nothing to do
      }
    }
    return;
  }

  try {
    console.log(`${TAG} removing worktree at ${worktreePath}`);
    await execFileAsync("git", ["worktree", "remove", worktreePath, "--force"], {
      cwd: canonical,
    });
  } catch (err) {
    console.warn(`${TAG} worktree remove failed for ${worktreePath}: ${err}`);
    try {
      await rm(worktreePath, { recursive: true, force: true });
      await execFileAsync("git", ["worktree", "prune"], { cwd: canonical });
    } catch (pruneErr) {
      console.warn(`${TAG} fallback cleanup failed for ${worktreePath}: ${pruneErr}`);
    }
  }

  if (options.deleteBranch !== false) {
    try {
      const hasBranch = await gitBranchExists(canonical, branchName);
      if (hasBranch) {
        console.log(`${TAG} deleting branch ${branchName}`);
        await execFileAsync("git", ["branch", "-D", branchName], { cwd: canonical });
      }
    } catch (err) {
      console.warn(`${TAG} branch delete failed for ${branchName}: ${err}`);
    }
  }
}

// ── Query helpers ───────────────────────────────────────────

async function gitBranchExists(repoPath: string, branchName: string): Promise<boolean> {
  try {
    await execFileAsync("git", ["rev-parse", "--verify", `refs/heads/${branchName}`], {
      cwd: repoPath,
    });
    return true;
  } catch {
    return false;
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
