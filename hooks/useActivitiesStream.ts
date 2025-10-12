"use client";

import { useEffect } from "react";
import { useRunsStore } from "@/store/runs";

export function useActivitiesStream(runId?: string) {
  const applyEvent = useRunsStore((state) => state.applyEvent);
  const lastEvent = useRunsStore((state) => state.lastEvent);

  useEffect(() => {
    const search = runId ? `?runId=${encodeURIComponent(runId)}` : "";
    const source = new EventSource(`/api/activities/stream${search}`);

    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        applyEvent(payload);
      } catch (error) {
        console.error("Failed to parse activity event", error);
      }
    };

    source.onerror = (error) => {
      console.error("Activity stream error", error);
      source.close();
    };

    return () => {
      source.close();
    };
  }, [applyEvent, runId]);

  return lastEvent;
}
