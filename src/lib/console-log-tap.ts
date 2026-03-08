import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import { join } from "node:path";
import { resolveInteractionLogRoot } from "@/lib/interaction-logger";

/**
 * Tap all console.log / console.warn / console.error output to a daily
 * log file alongside the interaction logs.
 *
 * File: {logRoot}/_server/{YYYY-MM-DD}/console.log
 *
 * Call once at process startup (instrumentation.ts).  Idempotent —
 * repeat calls are no-ops.
 */

let installed = false;

// Exported for testing — allows injecting a custom date function.
export let _dateNow: () => Date = () => new Date();
export function _setDateNow(fn: () => Date): void {
  _dateNow = fn;
}

export function installConsoleTap(): void {
  if (installed) return;
  installed = true;

  let currentDate = "";
  let stream: WriteStream | null = null;

  function ensureStream(): WriteStream | null {
    const date = _dateNow().toISOString().slice(0, 10);
    if (date !== currentDate || !stream) {
      if (stream) {
        stream.end();
      }
      const dir = join(resolveInteractionLogRoot(), "_server", date);
      try {
        mkdirSync(dir, { recursive: true });
      } catch {
        return null;
      }
      currentDate = date;
      stream = createWriteStream(join(dir, "console.log"), { flags: "a" });
      stream.on("error", () => {
        // Swallow write errors — never crash the server due to logging.
      });
    }
    return stream;
  }

  const origLog = console.log.bind(console);
  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);

  function formatArgs(args: unknown[]): string {
    return args
      .map((a) => {
        if (typeof a === "string") return a;
        if (a instanceof Error) return `${a.message}\n${a.stack ?? ""}`;
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      })
      .join(" ");
  }

  function writeLine(level: string, args: unknown[]): void {
    const s = ensureStream();
    if (!s) return;
    const ts = _dateNow().toISOString();
    const msg = formatArgs(args);
    s.write(`${ts} [${level}] ${msg}\n`);
  }

  console.log = (...args: unknown[]) => {
    origLog(...args);
    writeLine("LOG", args);
  };

  console.warn = (...args: unknown[]) => {
    origWarn(...args);
    writeLine("WARN", args);
  };

  console.error = (...args: unknown[]) => {
    origError(...args);
    writeLine("ERROR", args);
  };

  process.on("uncaughtException", (err) => {
    writeLine("FATAL", [`Uncaught exception: ${err.message}`, err.stack ?? ""]);
  });

  process.on("unhandledRejection", (reason) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    writeLine("FATAL", [`Unhandled rejection: ${msg}`, stack ?? ""]);
  });

  origLog("[console-tap] Console output tee active");
}
