"use client";

import { useEffect, useRef } from "react";
import { useNotificationStore } from "@/stores/notification-store";
import type { Beat } from "@/lib/types";

/**
 * Watches a list of beats and fires a notification whenever a beat
 * transitions to a shipped (or closed) terminal state.
 */
export function useShippedNotifications(beats: Beat[]) {
  const addNotification = useNotificationStore((s) => s.addNotification);
  const prevIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  useEffect(() => {
    const shippedBeats = beats.filter(
      (b) => b.state === "shipped" || b.state === "closed",
    );
    const currentIds = new Set(shippedBeats.map((b) => b.id));

    // First load — just record baseline, no notification.
    if (!initializedRef.current) {
      initializedRef.current = true;
      prevIdsRef.current = currentIds;
      return;
    }

    // Fire notification for newly-shipped beats
    const newlyShipped = shippedBeats.filter(
      (b) => !prevIdsRef.current.has(b.id),
    );
    for (const beat of newlyShipped) {
      addNotification({
        message: `"${beat.title}" has been shipped`,
        beadId: beat.id,
      });
    }

    prevIdsRef.current = currentIds;
  }, [beats, addNotification]);
}
