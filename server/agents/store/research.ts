import type { ResearchBriefDeliverable, ResearchPlan } from "@/models/research";
import { computeDeliverableKey } from "@/server/agents/store/deliverables";

type RunOutcome = {
  cacheKey: string;
  identicalToExisting: boolean;
};

const briefsByKey = new Map<string, ResearchBriefDeliverable>();
const runOutcomeById = new Map<string, RunOutcome>();
const plansByRunId = new Map<string, ResearchPlan>();

export const recordResearchBrief = (
  runId: string,
  brief: ResearchBriefDeliverable,
): { deliverable: ResearchBriefDeliverable; identicalToExisting: boolean; cacheKey: string } => {
  const cacheKey = computeDeliverableKey({ runId, topic: brief.topic, sources: brief.sources.map((source) => source.id) });
  const existing = briefsByKey.get(cacheKey);

  if (existing) {
    runOutcomeById.set(runId, { cacheKey, identicalToExisting: true });
    return { deliverable: existing, identicalToExisting: true, cacheKey };
  }

  briefsByKey.set(cacheKey, brief);
  runOutcomeById.set(runId, { cacheKey, identicalToExisting: false });

  return { deliverable: brief, identicalToExisting: false, cacheKey };
};

export const getResearchBrief = (cacheKey: string) => briefsByKey.get(cacheKey);

export const getResearchOutcome = (runId: string) => runOutcomeById.get(runId);

export const recordResearchPlan = (runId: string, plan: ResearchPlan) => {
  plansByRunId.set(runId, plan);
  return plan;
};

export const getResearchPlan = (runId: string) => plansByRunId.get(runId);

export const resetResearchBriefs = () => {
  briefsByKey.clear();
  runOutcomeById.clear();
  plansByRunId.clear();
};
