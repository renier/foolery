const BEAD_PREFIX_PATTERN = /^[^-]+-/;

/** Render bead IDs without repo prefix (e.g. "foolery-xmvb" -> "xmvb"). */
export function stripBeadPrefix(beadId: string): string {
  return beadId.replace(BEAD_PREFIX_PATTERN, "");
}

interface BuildBeadFocusHrefOptions {
  detailRepo?: string | null;
}

/**
 * Build a /beads URL that focuses a specific bead in the list/detail pane.
 * Preserves existing query params and updates bead/detailRepo as needed.
 */
export function buildBeadFocusHref(
  beadId: string,
  currentSearch: string,
  options?: BuildBeadFocusHrefOptions,
): string {
  const params = new URLSearchParams(currentSearch);
  params.set("bead", beadId);
  if (options?.detailRepo) {
    params.set("detailRepo", options.detailRepo);
  }
  const qs = params.toString();
  return `/beads${qs ? `?${qs}` : ""}`;
}
