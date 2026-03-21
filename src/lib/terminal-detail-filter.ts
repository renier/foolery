/**
 * Stateful line filter for terminal output that strips "thinking detail"
 * lines (numbered file content, etc.) when detail mode is off.
 *
 * The filter buffers partial lines (chunks that don't end with a newline)
 * so that pattern matching works correctly across chunk boundaries.
 */

/** Strip ANSI escape sequences for pattern matching only. */
function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
}

/** Matches numbered file content lines like `     1→"use client";` */
const NUMBERED_LINE_RE = /^\s+\d+[→│]/;

export interface TerminalDetailFilter {
  /** Filter a chunk of terminal output, returning only non-detail lines. */
  filter(chunk: string): string;
  /** Reset internal line-buffering state. */
  reset(): void;
}

export function createDetailFilter(): TerminalDetailFilter {
  let pending = "";
  let inDetailBlock = false;

  function isDetailLine(raw: string): boolean {
    const stripped = stripAnsi(raw);
    return NUMBERED_LINE_RE.test(stripped);
  }

  function filter(chunk: string): string {
    const input = pending + chunk;
    const lines = input.split("\n");

    // If input doesn't end with newline, last element is a partial line
    const hasTrailingNewline = input.endsWith("\n");
    if (!hasTrailingNewline) {
      pending = lines.pop() ?? "";
    } else {
      pending = "";
      // split produces an empty string after the trailing newline
      if (lines.length > 0 && lines[lines.length - 1] === "") {
        lines.pop();
      }
    }

    const output: string[] = [];
    for (const line of lines) {
      const stripped = stripAnsi(line).trim();

      if (isDetailLine(line)) {
        inDetailBlock = true;
        continue;
      }

      if (inDetailBlock && stripped === "") {
        // Blank line inside a detail block — suppress
        continue;
      }

      // Non-detail, non-blank line: exit detail block
      inDetailBlock = false;
      output.push(line);
    }

    if (output.length === 0) return "";
    return output.join("\n") + "\n";
  }

  function reset(): void {
    pending = "";
    inDetailBlock = false;
  }

  return { filter, reset };
}
