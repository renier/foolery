import { describe, expect, it } from "vitest";
import {
  inferCanonicalRepoPath,
  trimPathSeparators,
  beatBranchName,
  beatWorktreePath,
} from "@/lib/git-worktree";

describe("trimPathSeparators", () => {
  it("strips trailing forward slashes", () => {
    expect(trimPathSeparators("/foo/bar/")).toBe("/foo/bar");
  });

  it("strips trailing backslashes", () => {
    expect(trimPathSeparators("C:\\foo\\bar\\")).toBe("C:\\foo\\bar");
  });

  it("strips multiple trailing separators", () => {
    expect(trimPathSeparators("/foo/bar///")).toBe("/foo/bar");
  });

  it("returns empty string unchanged", () => {
    expect(trimPathSeparators("")).toBe("");
  });

  it("does not strip leading separators", () => {
    expect(trimPathSeparators("/foo/bar")).toBe("/foo/bar");
  });
});

describe("inferCanonicalRepoPath", () => {
  it("returns null for a plain repo path", () => {
    expect(inferCanonicalRepoPath("/home/user/myrepo")).toBeNull();
  });

  it("resolves .claude/worktrees/<name> to parent repo", () => {
    expect(
      inferCanonicalRepoPath("/home/user/myrepo/.claude/worktrees/agent-abc123"),
    ).toBe("/home/user/myrepo");
  });

  it("resolves .knots/_worktree to parent repo", () => {
    expect(
      inferCanonicalRepoPath("/home/user/myrepo/.knots/_worktree"),
    ).toBe("/home/user/myrepo");
  });

  it("resolves sibling -wt- worktree to parent repo", () => {
    expect(
      inferCanonicalRepoPath("/home/user/myrepo-wt-feature-1"),
    ).toBe("/home/user/myrepo");
  });

  it("resolves beat worktree naming convention to parent repo", () => {
    expect(
      inferCanonicalRepoPath("/home/user/myrepo-wt-beat123"),
    ).toBe("/home/user/myrepo");
  });

  it("handles trailing slashes", () => {
    expect(
      inferCanonicalRepoPath("/home/user/myrepo/.knots/_worktree/"),
    ).toBe("/home/user/myrepo");
  });

  it("returns null for empty string", () => {
    expect(inferCanonicalRepoPath("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(inferCanonicalRepoPath("   ")).toBeNull();
  });
});

describe("beatBranchName", () => {
  it("produces <repoName>-wt-<beatId>", () => {
    expect(beatBranchName("/home/user/myrepo", "abc123")).toBe("myrepo-wt-abc123");
  });

  it("uses the basename of the repo path", () => {
    expect(beatBranchName("/deeply/nested/path/coolproject", "fix-99")).toBe(
      "coolproject-wt-fix-99",
    );
  });

  it("handles trailing slashes on repoPath", () => {
    expect(beatBranchName("/home/user/myrepo/", "beat-1")).toBe("myrepo-wt-beat-1");
  });
});

describe("beatWorktreePath", () => {
  it("places worktree as sibling to the repo directory", () => {
    expect(beatWorktreePath("/home/user/myrepo", "abc123")).toBe(
      "/home/user/myrepo-wt-abc123",
    );
  });

  it("resolves through canonical path for worktree inputs", () => {
    expect(
      beatWorktreePath("/home/user/myrepo/.knots/_worktree", "abc123"),
    ).toBe("/home/user/myrepo-wt-abc123");
  });

  it("resolves through canonical path for .claude worktree inputs", () => {
    expect(
      beatWorktreePath("/home/user/myrepo/.claude/worktrees/agent-x", "beat-5"),
    ).toBe("/home/user/myrepo-wt-beat-5");
  });

  it("handles plain repo path without worktree nesting", () => {
    expect(beatWorktreePath("/opt/repos/project", "task-42")).toBe(
      "/opt/repos/project-wt-task-42",
    );
  });
});
