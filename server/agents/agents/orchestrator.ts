import { Agent } from "@openai/agents";
import { promptWithHandoffInstructions } from "@openai/agents-core/extensions";
import type { EmailAgentRuntimeContext } from "@/server/agents/runtime";
import { resolveContext } from "@/server/agents/runtime";
import { emailDraftAgent } from "@/server/agents/agents/email";
import { researchPlannerAgent } from "@/server/agents/agents/planner";
import { researchInvestigatorAgent } from "@/server/agents/agents/research";
import { draftEmailTool } from "@/server/agents/tools/draft-email";

const summarizeContext = (summary: string) => (summary.trim().length > 0 ? summary : "No structured context captured yet.");

const summarizePayload = (payload: unknown): string => {
  if (!payload || typeof payload !== "object") return "";

  const record = payload as Record<string, unknown>;
  const lines: string[] = [];

  const recipient = typeof record.recipient === "string" ? record.recipient : undefined;
  const tone = typeof record.tone === "string" ? record.tone : undefined;
  const variants = typeof record.variants === "number" || typeof record.variants === "string" ? String(record.variants) : undefined;
  const keyPoints = Array.isArray(record.keyPoints)
    ? (record.keyPoints as unknown[]).filter((value): value is string => typeof value === "string")
    : undefined;
  const additionalContext = typeof record.additionalContext === "string" ? record.additionalContext : undefined;

  const topic = typeof record.topic === "string" ? record.topic : undefined;
  const goal = typeof record.goal === "string" ? record.goal : undefined;
  const objective = typeof record.objective === "string" ? record.objective : undefined;
  const timeframe = typeof record.timeframe === "string" ? record.timeframe : undefined;
  const decisionFocus = typeof record.decisionFocus === "string" ? record.decisionFocus : undefined;
  const deliverable = typeof record.deliverable === "string" ? record.deliverable : undefined;

  if (recipient) lines.push(`Recipient: ${recipient}`);
  if (tone) lines.push(`Tone: ${tone}`);
  if (variants) lines.push(`Variants: ${variants}`);
  if (keyPoints && keyPoints.length > 0) {
    lines.push(`Key points: ${keyPoints.join(" | ")}`);
  }
  if (additionalContext) lines.push(`Additional context: ${additionalContext}`);

  const researchLines = [
    topic ? `Topic: ${topic}` : undefined,
    goal ? `Goal: ${goal}` : undefined,
    objective ? `Objective: ${objective}` : undefined,
    timeframe ? `Timeframe: ${timeframe}` : undefined,
    decisionFocus ? `Decision focus: ${decisionFocus}` : undefined,
    deliverable ? `Preferred deliverable: ${deliverable}` : undefined,
  ].filter(Boolean) as string[];

  lines.push(...researchLines);

  return lines.join("\n");
};

export const orchestratorAgent = new Agent<EmailAgentRuntimeContext>({
  name: "SideKick Orchestrator",
  handoffDescription: "Routes work to the specialist agents (email drafts, research, etc.).",
  instructions: (runContext) => {
    const ctx = resolveContext(runContext.context);
    if (!ctx) {
      return "Context unavailable. Respond with a brief acknowledgement and wait for a retry.";
    }

    const { payload, intent, workflowId } = ctx;
    const summary = summarizePayload(payload);

    const base = [
      "You are the SideKick orchestrator and the primary assistant in this chat.",
      "Hold natural conversations, clarify ambiguous requests, and only trigger tools when ready.",
      "When the operator requests an email draft, gather recipient, tone, the talking points, the event timing, and any constraints.",
      "Ask concise follow-up questions when details are missing or conflicting before drafting.",
      "Once you have the necessary details, call the `draft_email` tool with the structured fields (recipient, tone, keyPoints, additionalContext, variants).",
      "After the tool returns, present the generated subject and body clearly, include any variants, and highlight next steps for the operator.",
      "Do not fabricate tool outputs. Always use the tool response for the final draft.",
      "When the operator asks for competitive intel, due diligence, or synthesis of external knowledge, gather scope, timeframe, decision focus, and recency expectations.",
      "Delegate deep research work to the Research Planner first. Confirm the planner delivers a structured plan (Objective, Constraints, Tasks, Budgets, Open Questions).",
      "Review the planner's output with the operator when clarification is needed. Only after the plan is ready should you handoff to the Research Investigator.",
      "Ensure the Research Investigator receives the planner's structured plan and any additional context (geography, filters, deadlines).",
      "Summarize the outcomes of research handoffs, referencing the recorded deliverable and highlighting recommended follow-ups.",
      "Context gathered so far:",
      summarizeContext([
        `Intent: ${intent ?? "assist"}`,
        `Workflow: ${workflowId}`,
        summary,
      ]
        .filter((line) => typeof line === "string" && line.trim().length > 0)
        .join("\n")),
    ].join("\n");

    return promptWithHandoffInstructions(base);
  },
  handoffs: [emailDraftAgent, researchPlannerAgent, researchInvestigatorAgent],
  tools: [draftEmailTool],
  model: "gpt-5-mini",
  modelSettings: {
    reasoning: { effort: "low", summary: "detailed" },
    text: { verbosity: "low" },
  },
});
