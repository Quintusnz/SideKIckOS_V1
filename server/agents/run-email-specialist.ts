import { Runner, type AgentInputItem, OpenAIProvider } from "@openai/agents";
import type { EmailDraftAgentInput } from "@/models/email";
import { emailDraftAgent } from "@/server/agents/agents/email";
import { createRuntimeContext } from "@/server/agents/runtime";
import { getEmailDeliverable, getRunOutcome } from "@/server/agents/store/deliverables";

export type EmailSpecialistOptions = {
  threadId?: string;
};

export const runEmailDraftSpecialist = async (
  input: EmailDraftAgentInput,
  options: EmailSpecialistOptions = {},
) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const context = createRuntimeContext({ payload: input, threadId: options.threadId });
  const provider = new OpenAIProvider({ apiKey });
  const runner = new Runner({
    modelProvider: provider,
    model: "gpt-5",
    modelSettings: {
      reasoning: { effort: "medium" },
      text: { verbosity: "low" },
    },
    traceMetadata: {
      workflow_id: context.workflowId,
      run_id: context.runId,
      intent: context.intent,
    },
  });

  const conversation: AgentInputItem[] = [
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: "Please produce the email draft now using the provided workflow context.",
        },
      ],
    },
  ];

  await runner.run(emailDraftAgent, conversation, { context });

  const outcome = getRunOutcome(context.runId);
  if (!outcome) {
    throw new Error("Email specialist did not record a deliverable");
  }

  const deliverable = getEmailDeliverable(outcome.cacheKey);
  if (!deliverable) {
    throw new Error("Deliverable was not stored");
  }

  return {
    deliverable,
    identicalToExisting: outcome.identicalToExisting,
    cacheKey: outcome.cacheKey,
    runId: context.runId,
  };
};
