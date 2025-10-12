import { tool } from "@openai/agents";
import {
  emailDraftDeliverableSchema,
  type EmailDraftDeliverable,
} from "@/models/email";
import { recordEmailDeliverable } from "@/server/agents/store/deliverables";
import type { EmailAgentRuntimeContext } from "@/server/agents/runtime";
import { resolveContext } from "@/server/agents/runtime";

export type ReportResultOutcome = {
  deliverable: EmailDraftDeliverable;
  identicalToExisting: boolean;
  cacheKey: string;
};

export const normalizeEmailDeliverable = (payload: unknown): EmailDraftDeliverable => {
  const parsed = emailDraftDeliverableSchema.parse(payload);
  return {
    ...parsed,
    draft: {
      ...parsed.draft,
      variants: parsed.draft.variants ?? [],
    },
  };
};

export const reportEmailDraft = (
  payload: unknown,
  context: Pick<EmailAgentRuntimeContext, "runId">,
): ReportResultOutcome => {
  if (!context.runId) {
    throw new Error("Missing run identifier while recording deliverable");
  }

  const deliverable = normalizeEmailDeliverable(payload);
  return recordEmailDeliverable(context.runId, deliverable);
};

export const reportEmailDraftTool = tool({
  name: "report_result",
  description:
    "Finalise the email draft deliverable. Call this exactly once per run. Do not emit normal assistant text in the same turn.",
  parameters: emailDraftDeliverableSchema,
  strict: true,
  async execute(input, runContext) {
    const resolved = resolveContext(runContext?.context);
    if (!resolved?.runId) {
      throw new Error("runId missing from runtime context");
    }

    const outcome = reportEmailDraft(input, { runId: resolved.runId });
    return outcome.identicalToExisting
      ? `Deliverable reused from cache (${outcome.cacheKey}).`
      : `Deliverable recorded (${outcome.cacheKey}).`;
  },
});


