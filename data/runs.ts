import type { ActivityEvent, ActivityRun, ActivityStatus, ActivityStepLog, RunSummary } from "@/models/activity";

const now = Date.now();

const withTimestamp = (offsetMs: number) => new Date(now - offsetMs).toISOString();

const buildSteps = (
  runId: string,
  steps: Array<{ status: ActivityStatus; message: string; offset: number }>,
): ActivityStepLog[] =>
  steps
    .sort((a, b) => a.offset - b.offset)
    .map((step, index) => ({
      id: `${runId}-step-${index + 1}`,
      runId,
      status: step.status,
      message: step.message,
      timestamp: withTimestamp(step.offset),
    }));

export const RUNS: ActivityRun[] = [
  {
    id: "run-ops-refresh",
    name: "Ops Retrieval Refresh",
    status: "running",
    startedAt: withTimestamp(1000 * 60 * 12),
    steps: buildSteps("run-ops-refresh", [
      { status: "queued", message: "Queued by scheduler", offset: 1000 * 60 * 13 },
      { status: "running", message: "Loading new workflow definitions", offset: 1000 * 60 * 12 },
      { status: "running", message: "Rehydrating cached documents", offset: 1000 * 60 * 9 },
    ]),
  },
  {
    id: "run-agent-sync",
    name: "Agent Knowledge Sync",
    status: "done",
    startedAt: withTimestamp(1000 * 60 * 60 * 2),
    completedAt: withTimestamp(1000 * 60 * 60 * 2 - 1000 * 60 * 15),
    steps: buildSteps("run-agent-sync", [
      { status: "queued", message: "Queued by operator", offset: 1000 * 60 * 60 * 2 + 1000 * 60 },
      { status: "running", message: "Pulling upstream knowledge packs", offset: 1000 * 60 * 60 * 2 },
      { status: "running", message: "Merging content", offset: 1000 * 60 * 60 * 2 - 1000 * 60 * 5 },
      { status: "done", message: "Sync completed", offset: 1000 * 60 * 60 * 2 - 1000 * 60 * 15 },
    ]),
  },
  {
    id: "run-alert-triage",
    name: "Alert Triage",
    status: "error",
    startedAt: withTimestamp(1000 * 60 * 45),
    completedAt: withTimestamp(1000 * 60 * 40),
    steps: buildSteps("run-alert-triage", [
      { status: "queued", message: "Queued by API", offset: 1000 * 60 * 46 },
      { status: "running", message: "Loading incidents", offset: 1000 * 60 * 45 },
      { status: "error", message: "Connector timed out", offset: 1000 * 60 * 40 },
    ]),
  },
  {
    id: "run-synthetic-evals",
    name: "Synthetic Evals",
    status: "done",
    startedAt: withTimestamp(1000 * 60 * 10),
    completedAt: withTimestamp(1000 * 60 * 3),
    steps: buildSteps("run-synthetic-evals", [
      { status: "queued", message: "Queued for nightly batch", offset: 1000 * 60 * 12 },
      { status: "running", message: "Executing evaluation suite", offset: 1000 * 60 * 10 },
      { status: "done", message: "Reported metrics", offset: 1000 * 60 * 3 },
    ]),
  },
];

const toSummary = (run: ActivityRun): RunSummary => {
  const started = new Date(run.startedAt).getTime();
  const finished = run.completedAt ? new Date(run.completedAt).getTime() : now;
  return {
    id: run.id,
    name: run.name,
    status: run.status,
    startedAt: run.startedAt,
    durationMs: Math.max(finished - started, 0),
  };
};

export const RUN_SUMMARIES: RunSummary[] = RUNS.map(toSummary);

export const RUN_LOOKUP = new Map(RUNS.map((run) => [run.id, run] as const));

export const ACTIVITY_EVENTS: ActivityEvent[] = [
  {
    type: "run.updated",
    run: {
      ...RUNS[0],
      status: "running",
      steps: [...RUNS[0].steps],
    },
    timestamp: withTimestamp(1000 * 15),
  },
  {
    type: "step.logged",
    runId: RUNS[0].id,
    step: {
      id: `${RUNS[0].id}-step-${RUNS[0].steps.length + 1}`,
      runId: RUNS[0].id,
      status: "running",
      message: "Evaluating alert thresholds",
      timestamp: withTimestamp(1000 * 12),
    },
    timestamp: withTimestamp(1000 * 12),
  },
  {
    type: "run.completed",
    run: {
      ...RUNS[1],
      status: "done",
    },
    timestamp: withTimestamp(1000 * 60 * 30),
  },
];

export const getRun = (runId: string) => RUN_LOOKUP.get(runId);
