import path from "node:path";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("dispatch global swap layout", () => {
  const dispatchSectionSource = readFileSync(
    path.join(process.cwd(), "src/components/settings-dispatch-section.tsx"),
    "utf8",
  );
  const poolsSectionSource = readFileSync(
    path.join(process.cwd(), "src/components/settings-pools-section.tsx"),
    "utf8",
  );

  it("keeps a single dispatch-level swap control outside the per-step pool editor", () => {
    expect(dispatchSectionSource).toContain("<SettingsDispatchGlobalSwap");
    expect(dispatchSectionSource).toContain("Dispatch-wide replacement tool");
    expect(poolsSectionSource).not.toContain("SettingsDispatchGlobalSwap");
    expect(poolsSectionSource).not.toContain("Dispatch-wide replacement.");
  });

  it("guides pool editing toward the global swap control instead of embedding one per step", () => {
    expect(poolsSectionSource).toContain(
      "These editors only change one step at a time. Use the dispatch-wide",
    );
  });
});
