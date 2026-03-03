"use client";

import { useState, useEffect } from "react";

/**
 * Returns a live-updating elapsed time string from a given ISO date string.
 * Updates every second while mounted.
 */
export function useElapsedTime(since: string | undefined | null): string {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (!since) return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [since]);

  if (!since) return "--";

  const ms = now - new Date(since).getTime();
  if (ms < 0) return "0s";

  const totalSeconds = Math.floor(ms / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}
