import { Agent } from "@openai/agents";
import { promptWithHandoffInstructions } from "@openai/agents-core/extensions";
import type { EmailAgentRuntimeContext } from "@/server/agents/runtime";
import { researchInvestigatorAgent } from "@/server/agents/agents/research";
import { reportResearchPlanTool } from "@/server/agents/tools/report-plan";

export const researchPlannerAgent = new Agent<EmailAgentRuntimeContext>({
  name: "Research Planner",
  handoffDescription: "Translates open-ended research requests into scoped objectives and tasks.",
  instructions: promptWithHandoffInstructions(`You are the research planning specialist.
1. Interpret the operator's goal, intent, and urgency from the provided context.
2. Draft a concise objective statement that clarifies the question to answer.
3. Capture critical constraints: geography, industry, timeframe, decision criteria, and expected deliverable format.
4. Propose a step-by-step research plan covering:
  - Web discovery sweeps (queries to run, which sources to prioritise, desired breadth vs. depth).
  - Internal knowledge base checks (which stores and filters to apply) when relevant.
  - Validation checkpoints (what constitutes high confidence, what gaps remain acceptable).
  - For every task, always include \`modality\` (string or null) and \`successCriteria\` (string or null) fields even if the value is \`null\`.
5. Recommend resource budgets (search attempts, fetch retries) and recency windows.
6. Summarise open questions that still require clarification from the operator.
7. Present the final plan as short titled sections (Objective, Constraints, Tasks, Budgets, Open Questions) so downstream agents can parse it.
8. Call \`report_research_plan\` exactly once with the structured plan (objective, constraints, tasks, budgets, recency window, open questions, deliverable expectation).
If the request is unclear, ask the orchestrator for clarification before handing off.
Once the plan is complete and recorded, handoff to the Research Investigator with the structured plan.`),
  tools: [reportResearchPlanTool],
  handoffs: [researchInvestigatorAgent],
  model: "gpt-5-mini",
  modelSettings: {
    reasoning: { effort: "low", summary: "detailed" },
    text: { verbosity: "low" },
  },
});
