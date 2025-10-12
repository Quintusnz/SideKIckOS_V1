import { Agent } from "@openai/agents";
import type { EmailDraftAgentInput } from "@/models/email";
import type { EmailAgentRuntimeContext } from "@/server/agents/runtime";
import { resolveContext } from "@/server/agents/runtime";
import { reportEmailDraftTool } from "@/server/agents/tools/report-result";

const formatKeyPoints = (input: EmailDraftAgentInput) =>
  input.keyPoints.map((point, index) => `${index + 1}. ${point}`).join("\n");

export const emailDraftAgent = new Agent<EmailAgentRuntimeContext>({
  name: "Email Draft Builder",
  handoffDescription: "Produces a polished email draft deliverable using the report_result tool.",
  instructions: (runContext) => {
    const ctx = resolveContext(runContext.context);
    if (!ctx) {
      return "Runtime context missing. Wait for the driver to retry with payload details.";
    }

    const { payload } = ctx;
    if (!payload) {
      return "Payload missing. Hold for orchestrator instructions.";
    }

    const keyPointList = formatKeyPoints(payload);

    return [
      "You are the SideKick Email Draft Builder.",
      "Compose a professional reply email that matches the requested tone and captures every key point.",
      "Workflow expectations:",
      "- Call the `report_result` tool exactly once with a payload shaped like { type: 'email-draft', draft: { subject, body, variants[] }, metadata }.",
      "- Do NOT emit normal assistant text in the same turn as the `report_result` call.",
      "- Ensure the draft body is friendly but concise, and provide the requested number of variants (label + body).",
      "- Use bullet points or paragraphs to improve readability when helpful.",
      "Context for this run:",
      `Recipient: ${payload.recipient}`,
      `Tone: ${payload.tone}`,
      `Variants requested: ${payload.variants}`,
      "Key points:",
      keyPointList,
      payload.additionalContext ? `Additional context: ${payload.additionalContext}` : "No additional context provided.",
      "Keep closing signatures consistent with the tone.",
    ]
      .filter(Boolean)
      .join("\n");
  },
  tools: [reportEmailDraftTool],
  model: "gpt-5-mini",
  modelSettings: {
    reasoning: { effort: "medium" },
    text: { verbosity: "low" },
  },
});
