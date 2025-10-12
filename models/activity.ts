export type ActivityStatus = "queued" | "running" | "done" | "error";

export type ActivityStepLog = {
  id: string;
  runId: string;
  status: ActivityStatus;
  message: string;
  timestamp: string;
};

export type ActivityRun = {
  id: string;
  name: string;
  status: ActivityStatus;
  startedAt: string;
  completedAt?: string;
  steps: ActivityStepLog[];
};

export type RunSummary = {
  id: string;
  name: string;
  status: ActivityStatus;
  startedAt: string;
  durationMs: number;
};

export type ActivityEvent =
  | {
      type: "run.updated";
      run: ActivityRun;
      timestamp: string;
    }
  | {
      type: "run.completed";
      run: ActivityRun;
      timestamp: string;
    }
  | {
      type: "step.logged";
      runId: string;
      step: ActivityStepLog;
      timestamp: string;
    };
