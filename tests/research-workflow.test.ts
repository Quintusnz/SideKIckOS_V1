import { beforeEach, describe, expect, it } from "vitest";
import { RunContext } from "@openai/agents";
import { reportResearchPlanTool } from "@/server/agents/tools/report-plan";
import { reportResearchBriefTool } from "@/server/agents/tools/report-research";
import { createRuntimeContext } from "@/server/agents/runtime";
import { getResearchBrief, getResearchOutcome, getResearchPlan, resetResearchBriefs } from "@/server/agents/store/research";

const buildPlanInput = () => ({
  objective: "Deliver an executive-ready brief on Q3 AI infrastructure investments.",
  constraints: ["Focus on public companies", "North America"],
  tasks: [
    {
      title: "Survey recent funding announcements",
      detail: "Use web search to gather at least three primary sources from Q3.",
      modality: "web" as const,
      successCriteria: "Minimum three primary citations from Q3 2025",
    },
    {
      title: "Capture analyst commentary",
      detail: "Identify two contrasting analyst viewpoints to include in synthesis.",
      modality: "web" as const,
      successCriteria: "At least one bullish and one cautious perspective",
    },
  ],
  budgets: {
    webSearches: 6,
    fileSearches: 0,
    followUpIterations: 2,
    timeboxMinutes: 30,
    notes: "Escalate if coverage is thin for enterprise deals.",
  },
  recencyWindow: "Last 90 days",
  openQuestions: ["Should we include private funding rounds?"],
  deliverableExpectation: "Executive research brief",
  metadata: {
    urgency: "high",
  },
});

const buildBriefInput = () => ({
  topic: "Q3 AI infrastructure investments",
  summary: "Major hyperscalers accelerated investments while chip shortages pressured deployment timelines.",
  keyFindings: [
    {
      title: "Hyperscaler capital expenditure reached record highs",
      insight: "AWS, Azure, and Google Cloud collectively committed $40B+ to AI infrastructure expansions.",
      confidence: "high" as const,
      citations: ["result-aws-capex", "result-msft-capex"],
    },
    {
      title: "GPU supply remains a constraint",
      insight: "Lead times for advanced GPUs still exceed 20 weeks despite incremental supply gains.",
      confidence: "medium" as const,
      citations: ["result-gpu-supply"],
    },
  ],
  recommendations: [
    {
      action: "Prioritize multi-cloud commitments",
      rationale: "Spreads risk across suppliers amid capacity constraints.",
      priority: "near-term" as const,
      citations: ["result-analyst-view"],
    },
  ],
  followUps: ["Validate availability with preferred cloud partner"],
  sources: [
    {
      id: "result-aws-capex",
      title: "AWS Q3 earnings call",
      url: "https://example.com/aws-q3",
      description: "Primary source for capex figures",
      badge: "Primary",
      publishedAt: "2025-09-28",
    },
    {
      id: "result-gpu-supply",
      title: "Semiconductor industry report",
      url: "https://example.com/gpu-report",
      description: "Covers GPU supply constraints",
      badge: "Analyst",
      publishedAt: "2025-09-15",
    },
  ],
  metadata: {
    preparedBy: "Research Investigator",
  },
});

describe("Deep research workflow", () => {
  beforeEach(() => {
    resetResearchBriefs();
  });

  it("records the research plan and brief deliverable for a run", async () => {
    const context = createRuntimeContext({
      runId: "research-run-1",
      workflowId: "deep-research",
      intent: "investigate",
    });
    const runContext = new RunContext(context);

    const planInput = buildPlanInput();
    const planResponseRaw = await reportResearchPlanTool.invoke(runContext, JSON.stringify(planInput));
    expect(typeof planResponseRaw).toBe("string");
    const planResponse = JSON.parse(planResponseRaw as string) as { runId: string; plan: ReturnType<typeof buildPlanInput> };
    expect(planResponse.runId).toBe(context.runId);
    expect(planResponse.plan.objective).toBe(planInput.objective);

    const storedPlan = getResearchPlan(context.runId);
    expect(storedPlan).toBeDefined();
    expect(storedPlan).toMatchObject({
      objective: planInput.objective,
      constraints: planInput.constraints,
      tasks: planInput.tasks,
      budgets: planInput.budgets,
      recencyWindow: planInput.recencyWindow,
      openQuestions: planInput.openQuestions,
      deliverableExpectation: planInput.deliverableExpectation,
      metadata: planInput.metadata,
    });

    const briefInput = buildBriefInput();
    const briefResponseRaw = await reportResearchBriefTool.invoke(runContext, JSON.stringify(briefInput));
    expect(typeof briefResponseRaw).toBe("string");
    const briefResponse = JSON.parse(briefResponseRaw as string) as {
      deliverable: ReturnType<typeof buildBriefInput>;
      cacheKey: string;
      identicalToExisting: boolean;
      runId: string;
    };

    expect(briefResponse.runId).toBe(context.runId);
    expect(briefResponse.identicalToExisting).toBe(false);

    const outcome = getResearchOutcome(context.runId);
    expect(outcome).toBeDefined();
    expect(outcome?.identicalToExisting).toBe(false);
    expect(outcome?.cacheKey).toBe(briefResponse.cacheKey);

    const storedBrief = outcome ? getResearchBrief(outcome.cacheKey) : undefined;
    expect(storedBrief).toBeDefined();
    expect(storedBrief?.topic).toBe(briefInput.topic);
    expect(storedBrief?.keyFindings).toHaveLength(briefInput.keyFindings.length);

    const cachedResponseRaw = await reportResearchBriefTool.invoke(runContext, JSON.stringify(briefInput));
    const cachedResponse = JSON.parse(cachedResponseRaw as string) as {
      identicalToExisting: boolean;
      cacheKey: string;
    };
    expect(cachedResponse.identicalToExisting).toBe(true);
    expect(cachedResponse.cacheKey).toBe(briefResponse.cacheKey);

    const cachedPlan = getResearchPlan(context.runId);
    expect(cachedPlan).toBeDefined();
  });
});
