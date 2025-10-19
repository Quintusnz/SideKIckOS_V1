import { tool } from "@openai/agents";
import { researchPlanSchema, researchPlanToolParameters, type ResearchPlan } from "@/models/research";
import { resolveContext, type EmailAgentRuntimeContext } from "@/server/agents/runtime";
import { recordResearchPlan } from "@/server/agents/store/research";

const normalizePlan = (payload: unknown): ResearchPlan => {
  const parsed = researchPlanSchema.parse(payload);
  return {
    ...parsed,
    constraints: parsed.constraints ?? [],
    tasks: parsed.tasks ?? [],
    budgets: parsed.budgets ?? {},
    openQuestions: parsed.openQuestions ?? [],
    metadata: parsed.metadata ?? {},
  };
};

export const reportResearchPlanTool = tool({
  name: "report_research_plan",
  description: "Record the structured research plan before execution. Call exactly once after finalising the plan.",
  parameters: researchPlanToolParameters,
  strict: true,
  async execute(input, runContext) {
    const ctx = resolveContext(runContext?.context) as EmailAgentRuntimeContext | undefined;
    if (!ctx?.runId) {
      throw new Error("runId missing from runtime context");
    }

    const plan = normalizePlan(input);
    recordResearchPlan(ctx.runId, plan);

    return JSON.stringify({
      runId: ctx.runId,
      plan,
    });
  },
});
