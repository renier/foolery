import { describe, expect, it } from "vitest";
import { createDetailFilter } from "@/lib/terminal-detail-filter";

describe("createDetailFilter", () => {
  it("passes through plain text lines", () => {
    const f = createDetailFilter();
    const result = f.filter("Hello world\nAnother line\n");
    expect(result).toBe("Hello world\nAnother line\n");
  });

  it("passes through action headers (▶ lines)", () => {
    const f = createDetailFilter();
    const result = f.filter(
      "▶ Read /some/file.tsx\n▶ Grep pattern\n"
    );
    expect(result).toBe("▶ Read /some/file.tsx\n▶ Grep pattern\n");
  });

  it("strips numbered file content lines", () => {
    const f = createDetailFilter();
    const input = [
      "▶ Read /some/file.tsx",
      '     1→"use client";',
      "     2→",
      "     3→import { toast } from \"sonner\";",
      "",
    ].join("\n") + "\n";
    const result = f.filter(input);
    expect(result).toBe("▶ Read /some/file.tsx\n");
  });

  it("shows text after numbered block ends", () => {
    const f = createDetailFilter();
    const input = [
      "▶ Read /some/file.tsx",
      '     1→"use client";',
      "     2→import { foo } from \"bar\";",
      "",
      "Now let me modify the file.",
      "",
    ].join("\n") + "\n";
    const result = f.filter(input);
    expect(result).toBe(
      "▶ Read /some/file.tsx\nNow let me modify the file.\n\n"
    );
  });

  it("strips blank lines within a detail block", () => {
    const f = createDetailFilter();
    const input = [
      '     1→"use client";',
      "",
      "     3→import { foo } from \"bar\";",
      "",
    ].join("\n") + "\n";
    const result = f.filter(input);
    expect(result).toBe("");
  });

  it("handles lines with │ separator (pipe-style numbering)", () => {
    const f = createDetailFilter();
    const input = "  10│some content\n  11│more content\n";
    const result = f.filter(input);
    expect(result).toBe("");
  });

  it("handles ANSI escape codes in numbered lines", () => {
    const f = createDetailFilter();
    const input = '\x1b[90m     1→"use client";\x1b[0m\n';
    const result = f.filter(input);
    expect(result).toBe("");
  });

  it("handles chunk boundary splits", () => {
    const f = createDetailFilter();
    // First chunk: partial line (no newline)
    const r1 = f.filter("     1→\"use cli");
    expect(r1).toBe("");
    // Second chunk: completes the line
    const r2 = f.filter("ent\";\n");
    expect(r2).toBe("");
  });

  it("handles chunk boundary with non-detail continuation", () => {
    const f = createDetailFilter();
    const r1 = f.filter("Hello wor");
    expect(r1).toBe("");
    const r2 = f.filter("ld\nGoodbye\n");
    expect(r2).toBe("Hello world\nGoodbye\n");
  });

  it("reset clears internal state", () => {
    const f = createDetailFilter();
    // Enter a detail block
    f.filter('     1→"use client";\n');
    // Reset
    f.reset();
    // A blank line after reset should NOT be suppressed
    const result = f.filter("\nSome text\n");
    expect(result).toBe("\nSome text\n");
  });

  it("preserves agent text mixed with actions and detail", () => {
    const f = createDetailFilter();
    const input = [
      "Let me check the pools section.",
      "▶ Read /src/components/settings-pools-section.tsx",
      "▶ Read /src/components/settings-actions-section.tsx",
      '     1→"use client";',
      "     2→",
      '     3→import { toast } from "sonner";',
      '     4→import {',
      "     5→  Zap,",
      '     6→  Clapperboard,',
      "     7→  Layers,",
      '     8→} from "lucide-react";',
      "",
    ].join("\n") + "\n";

    const result = f.filter(input);
    expect(result).toBe(
      [
        "Let me check the pools section.",
        "▶ Read /src/components/settings-pools-section.tsx",
        "▶ Read /src/components/settings-actions-section.tsx",
        "",
      ].join("\n")
    );
  });

  it("returns empty string when all lines are detail", () => {
    const f = createDetailFilter();
    const input = '     1→line1\n     2→line2\n     3→line3\n';
    const result = f.filter(input);
    expect(result).toBe("");
  });
});
