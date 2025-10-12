import { describe, expect, beforeEach, it } from "vitest";
import type { ActivityEvent, ActivityRun, RunSummary } from "@/models/activity";
import { useRunsStore } from "@/store/runs";

const buildRun = (overrides: Partial<ActivityRun>): ActivityRun => ({
  id: "run-test",
  name: "Test Run",
  status: "running",
  startedAt: new Date("2024-01-01T00:00:00Z").toISOString(),
  steps: [],
  ...overrides,
});

const toSummary = (run: ActivityRun): RunSummary => ({
  id: run.id,
  name: run.name,
  status: run.status,
  startedAt: run.startedAt,
  durationMs: 1000,
});

describe("useRunsStore", () => {
  beforeEach(() => {
    useRunsStore.setState({ runs: [], lastEvent: undefined });
  });

  it("sorts runs by startedAt descending when setRuns is called", () => {
    const newerRun: RunSummary = {
      id: "newer",
      name: "Newer",
      status: "running",
      startedAt: "2024-01-02T12:00:00Z",
      durationMs: 1000,
    };
    const olderRun: RunSummary = {
      id: "older",
      name: "Older",
      status: "done",
      startedAt: "2024-01-01T12:00:00Z",
      durationMs: 2000,
    };

    useRunsStore.getState().setRuns([olderRun, newerRun]);

    const runs = useRunsStore.getState().runs;
    expect(runs[0].id).toBe("newer");
    expect(runs[1].id).toBe("older");
  });

  it("updates run status when receiving step.logged events", () => {
    const baseRun = toSummary(buildRun({ id: "run-1", status: "running" }));
    useRunsStore.getState().setRuns([baseRun]);

    const event: ActivityEvent = {
      type: "step.logged",
      runId: baseRun.id,
      step: {
        id: "step-1",
        runId: baseRun.id,
        status: "done",
        message: "Completed",
        timestamp: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    };

    useRunsStore.getState().applyEvent(event);

    const updated = useRunsStore.getState().runs.find((run) => run.id === baseRun.id);
    expect(updated?.status).toBe("done");
  });

  it("does not downgrade finished runs when receiving running steps", () => {
    const finishedRun = toSummary(buildRun({ id: "run-finished", status: "done" }));
    useRunsStore.getState().setRuns([finishedRun]);

    const downgradeEvent: ActivityEvent = {
      type: "step.logged",
      runId: finishedRun.id,
      step: {
        id: "step-new",
        runId: finishedRun.id,
        status: "running",
        message: "Unexpected continuation",
        timestamp: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    };

    useRunsStore.getState().applyEvent(downgradeEvent);

    const after = useRunsStore.getState().runs.find((run) => run.id === finishedRun.id);
    expect(after?.status).toBe("done");
  });

  it("upserts run summaries from run.updated events", () => {
    const event: ActivityEvent = {
      type: "run.updated",
      run: buildRun({ id: "run-update", status: "running" }),
      timestamp: new Date().toISOString(),
    };

    useRunsStore.getState().applyEvent(event);

    const stored = useRunsStore.getState().runs.find((run) => run.id === "run-update");
    expect(stored).toBeDefined();
    expect(stored?.status).toBe("running");
  });
});
