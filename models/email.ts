import { z } from "zod";

export const emailDraftVariantSchema = z.object({
  label: z.string().min(3, "Variant label must be at least 3 characters."),
  body: z.string().min(10, "Variant body must be at least 10 characters."),
});

export const emailDraftSchema = z.object({
  subject: z.string().min(3, "Subject must be at least 3 characters."),
  body: z.string().min(25, "Body must be at least 25 characters."),
  variants: z.array(emailDraftVariantSchema).max(4).default([]),
});

export const emailDraftAgentInputSchema = z
  .object({
    recipient: z.string().min(2, "Provide the recipient name or role."),
    tone: z.string().min(3, "Tone should describe the style (e.g. warm, formal)."),
    keyPoints: z.array(z.string().min(3)).min(1, "List at least one key point."),
    additionalContext: z.string().max(2000).optional(),
    variants: z.number().int().min(1).max(3).default(2),
  })
  .strict();

export const emailDraftDeliverableSchema = z.object({
  type: z.literal("email-draft"),
  draft: emailDraftSchema,
  metadata: z
    .object({
      recipient: z.string().min(2, "Recipient must include a name or role."),
      tone: z.string().min(3).max(32).nullable().optional(),
      keyPoints: z.array(z.string().min(3)).min(1),
      additionalContext: z.string().max(2000).nullable().optional(),
    })
    .strict(),
});

export type EmailDraftVariant = z.infer<typeof emailDraftVariantSchema>;
export type EmailDraft = z.infer<typeof emailDraftSchema>;
export type EmailDraftAgentInput = z.infer<typeof emailDraftAgentInputSchema>;
export type EmailDraftDeliverable = z.infer<typeof emailDraftDeliverableSchema>;

