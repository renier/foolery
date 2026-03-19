import path from "node:path";
import { readFileSync } from "node:fs";

import { describe, it, expect } from "vitest";

describe("retakes pagination layout", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/components/retakes-view.tsx"),
    "utf8",
  );

  it("renders pagination controls above and below the retakes list", () => {
    const matches = source.match(/\{pageCount > 1 && renderPaginationControls\(\)\}/g) ?? [];
    expect(matches).toHaveLength(2);
  });

  it("defaults the shared notes and handoff toggle to collapsed", () => {
    expect(source).toContain("const [showNotesAndHandoffs, setShowNotesAndHandoffs] = useState(false);");
    expect(source).toContain("{showNotesAndHandoffs && renderedNotes.length > 0 && (");
    expect(source).toContain("{showNotesAndHandoffs && renderedCapsules.length > 0 && (");
  });

  it("exposes one header toggle for notes and handoff capsules", () => {
    const toggleMatches = source.match(/Show notes and handoff capsules/g) ?? [];
    expect(toggleMatches).toHaveLength(2);
    expect(source).toContain('htmlFor="retakes-details-toggle"');
    expect(source).toContain('id="retakes-details-toggle"');
  });
});
