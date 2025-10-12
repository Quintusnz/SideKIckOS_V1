import { create } from "zustand";
import type { ActivityEvent, ActivityRun, ActivityStatus, RunSummary } from "@/models/activity";

const toSummary = (run: ActivityRun): RunSummary => {
  const start = new Date(run.startedAt).getTime();
  const end = run.completedAt ? new Date(run.completedAt).getTime() : Date.now();
  return {
    id: run.id,
    name: run.name,
    status: run.status,
    startedAt: run.startedAt,
    durationMs: Math.max(end - start, 0),
  };
};

const coerceStatus = (existing: ActivityStatus | undefined, next: ActivityStatus): ActivityStatus => {
  if (!existing) return next;
  if (existing === "error") return "error";
  if (existing === "done" && next === "running") return existing;
  return next;
};

type RunsState = {
  runs: RunSummary[];
  lastEvent?: ActivityEvent;
  setRuns: (runs: RunSummary[]) => void;
  upsertRun: (run: RunSummary) => void;
  applyEvent: (event: ActivityEvent) => void;
  reset: () => void;
};

const sortByStarted = (runs: RunSummary[]) =>
  [...runs].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

export const useRunsStore = create<RunsState>((set) => ({
  runs: [],
  lastEvent: undefined,
  setRuns: (runs) => set({ runs: sortByStarted(runs) }),
  upsertRun: (run) =>
    set((state) => {
      const index = state.runs.findIndex((item) => item.id === run.id);
      const next = [...state.runs];
      if (index === -1) {
        next.push(run);
      } else {
        next[index] = run;
      }
      return { runs: sortByStarted(next) };
    }),
  applyEvent: (event) =>
    set((state) => {
      if (event.type === "step.logged") {
        const updated = state.runs.map((item) =>
          item.id === event.runId
            ? {
                ...item,
                status: coerceStatus(item.status, event.step.status),
              }
            : item,
        );
        return { runs: updated, lastEvent: event };
      }

      const summary = toSummary(event.run);
      const index = state.runs.findIndex((item) => item.id === summary.id);
      const nextRuns = [...state.runs];
      if (index === -1) {
        nextRuns.push(summary);
      } else {
        nextRuns[index] = summary;
      }

      return { runs: sortByStarted(nextRuns), lastEvent: event };
    }),
  reset: () => ({ runs: [], lastEvent: undefined }),
}));
