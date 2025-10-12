import { Runner, type AgentInputItem, OpenAIProvider } from "@openai/agents";
import { emailDraftAgentInputSchema, type EmailDraftAgentInput, type EmailDraftDeliverable } from "@/models/email";
import { orchestratorAgent } from "@/server/agents/agents/orchestrator";
import { runEmailDraftFallback } from "@/server/agents/email-fallback";
import { createRuntimeContext } from "@/server/agents/runtime";
import { getEmailDeliverable, getRunOutcome } from "@/server/agents/store/deliverables";

const SENSITIVE_PATTERNS = [/ssn/i, /password/i, /credit\s*card/i];

export type EmailAgentRunnerInput = {
  payload: unknown;
  threadId?: string;
};

export type EmailAgentRunnerResponse =
  | {
      ok: true;
      deliverable: EmailDraftDeliverable;
      identicalToExisting: boolean;
      cacheKey: string;
      runId: string;
      providerConfigured: boolean;
      fallbackUsed?: boolean;
    }
  | {
      ok: false;
      reason: string;
      providerConfigured?: boolean;
    };

type GuardrailResult =
  | { ok: true }
  | { ok: false; reason: string };

const runGuardrails = (input: EmailDraftAgentInput): GuardrailResult => {
  const joined = [input.recipient, input.tone, input.additionalContext, ...input.keyPoints]
    .filter(Boolean)
    .join(" \n");

  const flagged = SENSITIVE_PATTERNS.find((pattern) => pattern.test(joined));
  if (flagged) {
    return {
      ok: false,
      reason: "Request appears to contain sensitive information. Please remove it before continuing.",
    };
  }

  return { ok: true };
};

const buildOrchestratorPrompt = (input: EmailDraftAgentInput) => {
  const lines = [
    "The operator provided structured email drafting inputs.",
    `Recipient: ${input.recipient}`,
    `Tone: ${input.tone}`,
    `Variants requested: ${input.variants}`,
    "Key points:",
    ...input.keyPoints.map((point, index) => `${index + 1}. ${point}`),
  ];

  if (input.additionalContext) {
    lines.push("Additional context:", input.additionalContext);
  }

  lines.push("Route to the email drafting specialist to complete the deliverable.");
  return lines.join("\n");
};

const runViaOrchestrator = async (
  input: EmailDraftAgentInput,
  threadId: string | undefined,
) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const context = createRuntimeContext({ payload: input, threadId });
  const provider = new OpenAIProvider({ apiKey });
  const runner = new Runner({
    modelProvider: provider,
    model: 'gpt-5',
    modelSettings: {
      reasoning: { effort: 'low' },
      text: { verbosity: 'low' },
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
          text: buildOrchestratorPrompt(input),
        },
      ],
    },
  ];

  await runner.run(orchestratorAgent, conversation, { context });

  const outcome = getRunOutcome(context.runId);
  if (!outcome) {
    throw new Error("Email agent did not record a deliverable");
  }

  const deliverable = getEmailDeliverable(outcome.cacheKey);
  if (!deliverable) {
    throw new Error("Deliverable missing from cache");
  }

  return {
    deliverable,
    identicalToExisting: outcome.identicalToExisting,
    cacheKey: outcome.cacheKey,
    runId: context.runId,
  };
};

export const runEmailAgentFromPayload = async (
  { payload, threadId }: EmailAgentRunnerInput,
): Promise<EmailAgentRunnerResponse> => {
  const parsed = emailDraftAgentInputSchema.safeParse(payload);
  const providerConfigured = Boolean(process.env.OPENAI_API_KEY);

  if (!parsed.success) {
    return {
      ok: false,
      reason: parsed.error.errors.map((error) => error.message).join("; "),
      providerConfigured,
    };
  }

  const guard = runGuardrails(parsed.data);
  if (!guard.ok) {
    return { ...guard, providerConfigured };
  }

  if (!providerConfigured) {
    const fallback = await runEmailDraftFallback(parsed.data, { threadId });
    return {
      ok: true,
      deliverable: fallback.deliverable,
      identicalToExisting: fallback.identicalToExisting,
      cacheKey: fallback.cacheKey,
      runId: fallback.context.runId,
      providerConfigured,
      fallbackUsed: true,
    };
  }

  try {
    const result = await runViaOrchestrator(parsed.data, threadId);
    return {
      ok: true,
      deliverable: result.deliverable,
      identicalToExisting: result.identicalToExisting,
      cacheKey: result.cacheKey,
      runId: result.runId,
      providerConfigured,
    };
  } catch (error) {
    console.error("Email agent orchestration failed", error);
    const fallback = await runEmailDraftFallback(parsed.data, { threadId });
    return {
      ok: true,
      deliverable: fallback.deliverable,
      identicalToExisting: fallback.identicalToExisting,
      cacheKey: fallback.cacheKey,
      runId: fallback.context.runId,
      providerConfigured,
      fallbackUsed: true,
    };
  }
};






