import {
  emailDraftSchema,
  type EmailDraftAgentInput,
  type EmailDraftDeliverable,
  type EmailDraftVariant,
} from "@/models/email";
import { createRuntimeContext, type EmailAgentRuntimeContext } from "@/server/agents/runtime";
import { reportEmailDraft } from "@/server/agents/tools/report-result";

const normalizeSentence = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const capitalized = trimmed[0].toUpperCase() + trimmed.slice(1);
  if (/([.!?])$/.test(capitalized)) return capitalized;
  return `${capitalized}.`;
};

const chooseTone = (tone: string | undefined) => {
  const normalized = tone?.toLowerCase().trim();
  switch (normalized) {
    case "friendly":
    case "warm":
      return { greeting: "Hi", signOff: "Warm regards", voice: "friendly" };
    case "formal":
      return { greeting: "Hello", signOff: "Sincerely", voice: "formal" };
    case "direct":
      return { greeting: "Hello", signOff: "Regards", voice: "direct" };
    case "enthusiastic":
      return { greeting: "Hey", signOff: "Cheers", voice: "enthusiastic" };
    default:
      return { greeting: "Hello", signOff: "Best regards", voice: "neutral" };
  }
};

const buildSubject = ({ recipient, keyPoints }: EmailDraftAgentInput) => {
  const focus = keyPoints[0] ?? "next steps";
  const cleaned = focus.replace(/^[^a-zA-Z0-9]+/, "").replace(/[.!?]+$/, "").trim();
  const prefix = recipient ? `For ${recipient}: ` : "";
  return `${prefix}${cleaned.length > 0 ? cleaned : "Next steps"}`;
};

const bulletList = (points: string[]) =>
  points
    .filter((point) => point.trim().length > 0)
    .map((point) => `- ${normalizeSentence(point)}`)
    .join("\n");

const buildPrimaryBody = (input: EmailDraftAgentInput) => {
  const { recipient, keyPoints, additionalContext, tone } = input;
  const tonePreset = chooseTone(tone);
  const greetingLine = `${tonePreset.greeting} ${recipient || "there"},`;
  const intro = tonePreset.voice === "formal"
    ? "I hope you are well."
    : "I hope your day is going well.";
  const purpose = normalizeSentence(
    additionalContext ??
      "I wanted to summarize the plan so we can keep momentum on the request"
  );
  const bullets = bulletList(keyPoints);
  const closingPrompt = tonePreset.voice === "direct"
    ? "Let me know if anything needs adjustment so I can update immediately."
    : "Please let me know if anything needs refining or if you'd like to discuss details.";

  return [
    greetingLine,
    "",
    `${intro} ${purpose}`.trim(),
    "",
    "Here are the talking points we'll highlight:",
    bullets,
    "",
    closingPrompt,
    "",
    `${tonePreset.signOff},`,
    "SideKick OS Assistant",
  ]
    .filter(Boolean)
    .join("\n");
};

const buildVariantBodies = (input: EmailDraftAgentInput): EmailDraftVariant[] => {
  const variants: Array<[string, string]> = [
    [
      "Concise recap",
      [
        `${chooseTone(input.tone).greeting} ${input.recipient || "there"},`,
        "",
        `Quick recap of what we'll cover: ${input.keyPoints.map(normalizeSentence).join(" ")}`,
        "",
        "Appreciate your feedback on any lingering items.",
        "",
        `${chooseTone(input.tone).signOff},`,
        "SideKick OS Assistant",
      ].join("\n"),
    ],
    [
      "Action-focused",
      [
        `${chooseTone("direct").greeting} ${input.recipient || "team"},`,
        "",
        "Here's the plan of action:",
        bulletList(input.keyPoints),
        "",
        "I'll send a finalized version after your review.",
        "",
        `${chooseTone("direct").signOff},`,
        "SideKick OS Assistant",
      ].join("\n"),
    ],
    [
      "Relationship-first",
      [
        `${chooseTone("friendly").greeting} ${input.recipient || "there"},`,
        "",
        "Appreciate the opportunity to collaborate. Key notes I'll weave in:",
        bulletList(input.keyPoints),
        "",
        "Happy to adjust tone or detail based on your perspective.",
        "",
        `${chooseTone("friendly").signOff},`,
        "SideKick OS Assistant",
      ].join("\n"),
    ],
  ];

  return variants.slice(0, input.variants ?? 2).map(([label, body]) => ({ label, body }));
};

const buildDeliverable = (
  input: EmailDraftAgentInput,
  context: EmailAgentRuntimeContext,
): EmailDraftDeliverable => {
  const draft = emailDraftSchema.parse({
    subject: buildSubject(input),
    body: buildPrimaryBody(input),
    variants: buildVariantBodies(input),
  });

  return {
    type: "email-draft",
    draft,
    metadata: {
      recipient: input.recipient,
      tone: input.tone,
      keyPoints: input.keyPoints,
      additionalContext: input.additionalContext,
    },
  };
};

export type EmailAgentRunResult = {
  deliverable: EmailDraftDeliverable;
  identicalToExisting: boolean;
  cacheKey: string;
  context: EmailAgentRuntimeContext;
};

export const runEmailDraftFallback = async (
  input: EmailDraftAgentInput,
  runtimeOverrides: Partial<Omit<EmailAgentRuntimeContext, "payload">> = {},
): Promise<EmailAgentRunResult> => {
  const context = createRuntimeContext({ payload: input, ...runtimeOverrides });
  const deliverable = buildDeliverable(input, context);
  const outcome = reportEmailDraft(deliverable, { runId: context.runId });
  return { ...outcome, context };
};

