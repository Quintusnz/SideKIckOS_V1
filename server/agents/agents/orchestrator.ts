import { Agent } from "@openai/agents";
import { promptWithHandoffInstructions } from "@openai/agents-core/extensions";
import type { EmailAgentRuntimeContext } from "@/server/agents/runtime";
import { resolveContext } from "@/server/agents/runtime";
import { emailDraftAgent } from "@/server/agents/agents/email";
import { draftEmailTool } from "@/server/agents/tools/draft-email";

const summarizeContext = (summary: string) => (summary.trim().length > 0 ? summary : "No structured context captured yet.");

export const orchestratorAgent = new Agent<EmailAgentRuntimeContext>({
  name: "SideKick Orchestrator",
  handoffDescription: "Routes work to the specialist agents (email drafts, research, etc.).",
  instructions: (runContext) => {
    const ctx = resolveContext(runContext.context);
    if (!ctx) {
      return "Context unavailable. Respond with a brief acknowledgement and wait for a retry.";
    }

    const { payload } = ctx;
    const summary = payload
      ? [
          `Recipient: ${payload.recipient}`,
          `Tone: ${payload.tone}`,
          `Variants: ${payload.variants}`,
          `Key points: ${payload.keyPoints.join(" | ")}`,
          payload.additionalContext ? `Additional context: ${payload.additionalContext}` : undefined,
        ]
          .filter(Boolean)
          .join("\n")
      : "";

    const base = [
      "You are the SideKick orchestrator and the primary assistant in this chat.",
      "Hold natural conversations, clarify ambiguous requests, and only trigger tools when ready.",
      "When the operator requests an email draft, gather recipient, tone, the talking points, the event timing, and any constraints.",
      "Ask concise follow-up questions when details are missing or conflicting before drafting.",
      "Once you have the necessary details, call the `draft_email` tool with the structured fields (recipient, tone, keyPoints, additionalContext, variants).",
      "After the tool returns, present the generated subject and body clearly, include any variants, and highlight next steps for the operator.",
      "Do not fabricate tool outputs. Always use the tool response for the final draft.",
      "Context gathered so far:",
      summarizeContext(summary),
    ].join("\n");

    return promptWithHandoffInstructions(base);
  },
  handoffs: [emailDraftAgent],
  tools: [draftEmailTool],
  model: "gpt-5",
  modelSettings: {
    reasoning: { effort: "low" },
    text: { verbosity: "low" },
  },
});
