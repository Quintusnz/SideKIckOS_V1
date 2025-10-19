import { tool } from "@openai/agents";
import { researchBriefDeliverableSchema, researchBriefJsonSchema, type ResearchBriefDeliverable } from "@/models/research";
import { resolveContext, type EmailAgentRuntimeContext } from "@/server/agents/runtime";
import { recordResearchBrief } from "@/server/agents/store/research";

// Cast research brief JSON schema to tool parameter type
type ResearchBriefJsonProperties = Record<string, any>;
const researchBriefToolParameters = researchBriefJsonSchema as unknown as any;

const normalizeBrief = (payload: unknown): ResearchBriefDeliverable => {
  const parsed = researchBriefDeliverableSchema.parse(payload);
  return {
    ...parsed,
    recommendations: parsed.recommendations ?? [],
    followUps: parsed.followUps ?? [],
    sources: parsed.sources ?? [],
    metadata: parsed.metadata ?? {},
  };
};

export const reportResearchBriefTool = tool({
  name: "report_research",
  description:
    "Finalize the research brief deliverable. Call this exactly once per investigation after synthesizing findings and citations.",
  parameters: researchBriefToolParameters,
  strict: true,
  async execute(input, runContext) {
    const ctx = resolveContext(runContext?.context) as EmailAgentRuntimeContext | undefined;
    if (!ctx?.runId) {
      throw new Error("runId missing from runtime context");
    }

    const brief = normalizeBrief(input);
    const outcome = recordResearchBrief(ctx.runId, brief);
    return JSON.stringify({
      deliverable: outcome.deliverable,
      cacheKey: outcome.cacheKey,
      identicalToExisting: outcome.identicalToExisting,
      runId: ctx.runId,
    });
  },
});
