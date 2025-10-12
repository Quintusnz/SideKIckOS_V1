import { tool } from "@openai/agents";
import { z } from "zod";
import type { EmailDraftAgentInput } from "@/models/email";
import { runEmailDraftSpecialist } from "@/server/agents/run-email-specialist";
import type { EmailAgentRuntimeContext } from "@/server/agents/runtime";

const draftEmailParameters = z.object({
  recipient: z.string().min(2, "Recipient must be at least 2 characters."),
  tone: z.string().min(3, "Tone should describe the style.").default("neutral"),
  keyPoints: z.array(z.string().min(3, "Key points must be at least 3 characters.")).min(1),
  additionalContext: z.string().max(2000).nullable().default(null),
  variants: z.number().int().min(1).max(3).default(2),
});

const toPayload = (input: z.infer<typeof draftEmailParameters>): EmailDraftAgentInput => ({
  recipient: input.recipient,
  tone: input.tone,
  keyPoints: input.keyPoints,
  additionalContext: input.additionalContext ?? undefined,
  variants: input.variants,
});

export const draftEmailTool = tool({
  name: "draft_email",
  description:
    "Collect the recipient, tone, key points, and optional context, then generate an email draft.",
  parameters: draftEmailParameters,
  strict: true,
  async execute(input, runContext) {
    const ctx = (runContext?.context ?? {}) as Partial<EmailAgentRuntimeContext>;
    const payload = toPayload(input);
    const result = await runEmailDraftSpecialist(payload, { threadId: ctx.threadId });

    return JSON.stringify({
      subject: result.deliverable.draft.subject,
      body: result.deliverable.draft.body,
      variants: result.deliverable.draft.variants,
      metadata: result.deliverable.metadata,
      cacheKey: result.cacheKey,
      runId: result.runId,
      identicalToExisting: result.identicalToExisting,
    });
  },
});
