import { randomUUID } from "crypto";
export type SidekickAgentRuntimeContext = {
  runId: string;
  threadId?: string;
  workflowId: string;
  intent: string;
  createdAt: string;
  payload?: unknown;
  metadata?: Record<string, unknown>;
};

export type EmailAgentRuntimeContext = SidekickAgentRuntimeContext;

type RuntimeOptions = {
  payload?: unknown;
  runId?: string;
  threadId?: string;
  workflowId?: string;
  intent?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
};

export const createRuntimeContext = ({
  payload,
  runId,
  threadId,
  workflowId,
  intent,
  createdAt,
  metadata,
}: RuntimeOptions): EmailAgentRuntimeContext => ({
  runId: runId ?? randomUUID(),
  threadId,
  workflowId: workflowId ?? "sidekick-orchestrator",
  intent: intent ?? "assist",
  createdAt: createdAt ?? new Date().toISOString(),
  payload,
  metadata,
});

export const resolveContext = (value: unknown): EmailAgentRuntimeContext | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const ctx = value as Partial<EmailAgentRuntimeContext>;
  if (!ctx.runId) return undefined;
  return {
    runId: ctx.runId,
    threadId: ctx.threadId,
    workflowId: ctx.workflowId ?? "sidekick-orchestrator",
    intent: ctx.intent ?? "assist",
    createdAt: ctx.createdAt ?? new Date().toISOString(),
    payload: ctx.payload,
    metadata: ctx.metadata,
  };
};

type StepStatus = "queued" | "running" | "done" | "error";

type StepRecord = {
  id: string;
  status: StepStatus;
  message: string;
  progress: number;
  timestamp: string;
};

const stepLog = new Map<string, StepRecord>();

export const startStep = (stepId: string, message: string) => {
  const record: StepRecord = {
    id: stepId,
    status: "running",
    message,
    progress: 1,
    timestamp: new Date().toISOString(),
  };
  stepLog.set(stepId, record);
  return record;
};

export const completeStep = (stepId: string, status: Exclude<StepStatus, "running">, message?: string) => {
  const current = stepLog.get(stepId);
  const next: StepRecord = {
    id: stepId,
    status,
    message: message ?? current?.message ?? "",
    progress: 100,
    timestamp: new Date().toISOString(),
  };
  stepLog.set(stepId, next);
  return next;
};

export const getSteps = () => Array.from(stepLog.values());
