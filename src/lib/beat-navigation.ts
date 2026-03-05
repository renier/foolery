const BEAT_PREFIX_PATTERN = /^[^-]+-/;

/** Render beat IDs without repo prefix (e.g. "foolery-xmvb" -> "xmvb"). */
export function stripBeatPrefix(beatId: string): string {
  return beatId.replace(BEAT_PREFIX_PATTERN, "");
}

/** Extract the repo-name prefix from a beat ID (e.g. "foolery-xmvb" -> "foolery"). */
export function extractBeatPrefix(beatId: string): string | null {
  const match = beatId.match(/^([^-]+)-/);
  return match ? match[1] : null;
}

interface RepoMatch {
  name: string;
  path: string;
}

function getPathBasename(path: string): string | null {
  if (!path) return null;
  const parts = path.split(/[\\/]+/).filter((part) => part.length > 0);
  return parts.length > 0 ? parts[parts.length - 1] : null;
}

/**
 * Resolve which registered repo owns a beat ID by matching `<project-prefix>-`.
 * Prefixes are matched against both the stored repo name and the repo path basename.
 * Uses the longest matching prefix so hyphenated project names are handled correctly.
 */
export function findRepoForBeatId<T extends RepoMatch>(
  beatId: string,
  repos: readonly T[],
): T | null {
  let match: T | null = null;
  let longestPrefixLength = -1;
  for (const repo of repos) {
    const prefixes = new Set<string>([repo.name]);
    const basename = getPathBasename(repo.path);
    if (basename) prefixes.add(basename);

    for (const prefix of prefixes) {
      if (!beatId.startsWith(`${prefix}-`)) continue;
      if (prefix.length > longestPrefixLength) {
        match = repo;
        longestPrefixLength = prefix.length;
      }
    }
  }
  return match;
}

interface BuildBeatFocusHrefOptions {
  detailRepo?: string | null;
  repo?: string | null;
}

/**
 * Build a /beats URL that focuses a specific beat in the list/detail pane.
 * Preserves existing query params and updates beat/detailRepo as needed.
 */
export function buildBeatFocusHref(
  beatId: string,
  currentSearch: string,
  options?: BuildBeatFocusHrefOptions,
): string {
  const params = new URLSearchParams(currentSearch);
  if (options && "repo" in options) {
    if (options.repo) params.set("repo", options.repo);
    else params.delete("repo");
  }
  params.set("beat", beatId);
  if (options && "detailRepo" in options) {
    if (options.detailRepo) params.set("detailRepo", options.detailRepo);
    else params.delete("detailRepo");
  }
  const qs = params.toString();
  return `/beats${qs ? `?${qs}` : ""}`;
}
