import { NextRequest, NextResponse } from "next/server";
import { Runner, type AgentInputItem, OpenAIProvider } from "@openai/agents";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { orchestratorAgent } from "@/server/agents/agents/orchestrator";
import { getOrCreateSession, updateSessionHistory } from "@/server/agents/conversation-store";
import {
  researchBriefDeliverableSchema,
  researchPlanSchema,
  type ResearchBriefDeliverable,
  type ResearchPlan,
} from "@/models/research";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const toUserMessage = (text: string): AgentInputItem => ({
  role: "user",
  content: [
    {
      type: "input_text",
      text,
    },
  ],
});

const extractIncomingMessageText = (message: unknown): string => {
  if (!message || typeof message !== "object") return "";
  const candidate = message as { content?: unknown; parts?: unknown };

  if (typeof candidate.content === "string") {
    return candidate.content;
  }

  const parts = candidate.parts;
  if (!Array.isArray(parts)) return "";

  return parts
    .filter((part) => part && typeof part === "object" && (part as { type?: unknown }).type === "text")
    .map((part) => {
      const text = (part as { text?: unknown }).text;
      return typeof text === "string" ? text : "";
    })
    .join("")
    .trim();
};

const extractAssistantText = (item: AgentInputItem) => {
  if ((item as any).role !== "assistant") return "";
  const content = (item as any).content ?? [];
  return content
    .filter((part: any) => part?.type === "output_text")
    .map((part: any) => part.text ?? "")
    .join("")
    .trim();
};

const normalizeWhitespace = (value: string) => value.trim().replace(/\s+/g, " ");

const safeParseJSON = (value: unknown) => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

type ToolInteraction = {
  id: string;
  name: string;
  status: "started" | "completed" | "error";
  arguments?: unknown;
  result?: unknown;
};

type EmailDraftDeliverable = {
  subject: string;
  body: string;
  variants: Array<{ label: string; body: string }>;
  metadata: Record<string, unknown>;
  cacheKey: string;
  runId: string;
  identicalToExisting?: boolean;
};

type ResearchBriefPart = {
  deliverable: ResearchBriefDeliverable;
  cacheKey: string;
  runId: string;
  identicalToExisting?: boolean;
};

type ResearchPlanPart = {
  plan: ResearchPlan;
  runId: string;
};

type ReasoningStep = {
  title: string;
  detail: string;
};

type SourceItem = {
  id: string;
  title: string;
  description?: string | null;
  url?: string | null;
  badge?: string | null;
};

const extractReasoningText = (item: unknown): string => {
  if (!item || typeof item !== "object") return "";
  const candidate = item as { rawItem?: unknown; rawContent?: unknown; content?: unknown; text?: unknown };
  const raw = candidate.rawItem && typeof candidate.rawItem === "object" ? (candidate.rawItem as any) : candidate;

  if (Array.isArray(raw.rawContent)) {
    return raw.rawContent
      .map((entry: any) => (typeof entry?.text === "string" ? entry.text : ""))
      .join(" ")
      .trim();
  }

  if (Array.isArray(raw.content)) {
    return raw.content
      .map((entry: any) => {
        if (typeof entry === "string") return entry;
        if (typeof entry?.text === "string") return entry.text;
        if (typeof entry?.input_text === "string") return entry.input_text;
        return "";
      })
      .join(" ")
      .trim();
  }

  if (typeof raw.text === "string") {
    return raw.text.trim();
  }

  return "";
};

const collectAssistantText = (items: AgentInputItem[]): string =>
  items
    .map((item) => extractAssistantText(item))
    .filter((text) => text.length > 0)
    .join("\n\n");

const writeTextChunks = (writer: { write: (chunk: any) => void }, id: string, text: string) => {
  if (!text) return;
  const normalized = text.replace(/\r\n/g, "\n");
  if (!normalized.trim()) {
    writer.write({ type: "text-delta", id, delta: normalized });
    return;
  }

  const chunkSize = 400;
  for (let index = 0; index < normalized.length; index += chunkSize) {
    const delta = normalized.slice(index, index + chunkSize);
    writer.write({ type: "text-delta", id, delta });
  }
};

const extractToolInteractions = (items: AgentInputItem[]): ToolInteraction[] => {
  const calls = new Map<string, ToolInteraction>();
  let generatedId = 0;

  for (const item of items) {
    const candidate = item as any;
    const type = candidate?.type;
    if (!type) continue;

    if (type === "function_call_arguments") {
      const id = String(candidate.call_id ?? candidate.id ?? `tool-${generatedId++}`);
      const name = candidate.name ?? candidate.tool_name ?? "tool";
      const rawArguments = candidate.arguments ?? candidate.args ?? candidate.input ?? candidate.content;
      const parsedArguments = safeParseJSON(
        typeof rawArguments === "string"
          ? rawArguments
          : (rawArguments?.text ?? rawArguments?.input_text ?? rawArguments),
      );

      calls.set(id, {
        id,
        name,
        status: "started",
        arguments: parsedArguments,
      });
    }

    if (type === "function_call_result") {
      const id = String(candidate.call_id ?? candidate.id ?? candidate.result_id ?? `tool-${generatedId++}`);
      const name = candidate.name ?? candidate.tool_name ?? "tool";
      const rawOutput = candidate.output ?? candidate.result ?? candidate.data ?? candidate.content;
      const parsedOutput = safeParseJSON(
        typeof rawOutput === "string"
          ? rawOutput
          : (rawOutput?.text ?? rawOutput?.output_text ?? rawOutput),
      );

      const existing = calls.get(id) ?? { id, name, status: "started" as const };
      calls.set(id, {
        ...existing,
        name,
        status: "completed",
        result: parsedOutput,
      });
    }

    if (type === "function_call_error") {
      const id = String(candidate.call_id ?? candidate.id ?? `tool-${generatedId++}`);
      const name = candidate.name ?? candidate.tool_name ?? "tool";
      const existing = calls.get(id) ?? { id, name, status: "started" as const };
      calls.set(id, {
        ...existing,
        name,
        status: "error",
      });
    }
  }

  return Array.from(calls.values());
};

const extractEmailDeliverables = (items: AgentInputItem[]): EmailDraftDeliverable[] => {
  const deliverables: EmailDraftDeliverable[] = [];

  for (const item of items) {
    const candidate = item as any;
    if (candidate?.type !== "function_call_result" || candidate?.name !== "draft_email") continue;

    const output = candidate.output ?? candidate.result ?? candidate.data ?? candidate.content;
    const parsed = safeParseJSON(
      typeof output === "string"
        ? output
        : (output?.text ?? output?.output_text ?? output),
    );

    if (!parsed || typeof parsed !== "object") continue;
    const payload = parsed as Partial<EmailDraftDeliverable>;
    if (!payload.subject || !payload.body || !payload.cacheKey || !payload.runId) continue;

    deliverables.push({
      subject: payload.subject,
      body: payload.body,
      variants: Array.isArray(payload.variants) ? payload.variants : [],
      metadata: (payload.metadata as Record<string, unknown>) ?? {},
      cacheKey: payload.cacheKey,
      runId: payload.runId,
      identicalToExisting: Boolean(payload.identicalToExisting),
    });
  }

  return deliverables;
};

const extractResearchDeliverables = (items: AgentInputItem[]): ResearchBriefPart[] => {
  const briefs: ResearchBriefPart[] = [];

  for (const item of items) {
    const candidate = item as any;
    if (candidate?.type !== "function_call_result" || candidate?.name !== "report_research") continue;

    const output = candidate.output ?? candidate.result ?? candidate.data ?? candidate.content;
    const parsed = safeParseJSON(
      typeof output === "string"
        ? output
        : (output?.text ?? output?.output_text ?? output),
    );

    if (!parsed || typeof parsed !== "object") continue;
    const payload = parsed as {
      deliverable?: unknown;
      cacheKey?: unknown;
      runId?: unknown;
      identicalToExisting?: unknown;
    };

    try {
      const deliverable = researchBriefDeliverableSchema.parse(payload.deliverable ?? parsed);
      const cacheKey = typeof payload.cacheKey === "string" ? payload.cacheKey : "";
      const runId = typeof payload.runId === "string" ? payload.runId : "";
      if (!cacheKey || !runId) continue;
      briefs.push({
        deliverable,
        cacheKey,
        runId,
        identicalToExisting: Boolean(payload.identicalToExisting),
      });
    } catch (error) {
      console.error("Failed to parse report_research tool output", error);
    }
  }

  return briefs;
};

const extractResearchPlans = (items: AgentInputItem[]): ResearchPlanPart[] => {
  const plans: ResearchPlanPart[] = [];

  for (const item of items) {
    const candidate = item as any;
    if (candidate?.type !== "function_call_result" || candidate?.name !== "report_research_plan") continue;

    const output = candidate.output ?? candidate.result ?? candidate.data ?? candidate.content;
    const parsed = safeParseJSON(
      typeof output === "string"
        ? output
        : (output?.text ?? output?.output_text ?? output),
    );

    if (!parsed || typeof parsed !== "object") continue;
    const payload = parsed as { plan?: unknown; runId?: unknown };

    try {
      const plan = researchPlanSchema.parse(payload.plan ?? parsed);
      const runId = typeof payload.runId === "string" ? payload.runId : "";
      plans.push({ plan, runId });
    } catch (error) {
      console.error("Failed to parse report_research_plan output", error);
    }
  }

  return plans;
};

const buildReasoningSteps = (
  userText: string,
  toolCalls: ToolInteraction[],
  emailDeliverables: EmailDraftDeliverable[],
  researchDeliverables: ResearchBriefPart[],
): ReasoningStep[] => {
  const steps: ReasoningStep[] = [];

  if (userText) {
    const preview = userText.length > 160 ? `${userText.slice(0, 157)}` : userText;
    steps.push({
      title: "Understand operator request",
      detail: normalizeWhitespace(`Parsed the latest prompt: ${preview}`),
    });
  }

  const draftCall = toolCalls.find((call) => call.name === "draft_email");
  if (draftCall) {
    const args = draftCall.arguments as Record<string, unknown> | undefined;
    const summaryParts: string[] = [];
    const recipient = typeof args?.recipient === "string" ? args.recipient : undefined;
    const tone = typeof args?.tone === "string" ? args.tone : undefined;
    const keyPoints = Array.isArray(args?.keyPoints) ? (args.keyPoints as unknown[]) : undefined;

    if (recipient) summaryParts.push(`recipient ${recipient}`);
    if (tone) summaryParts.push(`tone ${tone}`);
    if (keyPoints) summaryParts.push(`${keyPoints.length} key points`);

    steps.push({
      title: "Delegate to drafting specialist",
      detail: normalizeWhitespace(
        summaryParts.length > 0
          ? `Called draft_email with ${summaryParts.join(", ")}.`
          : "Triggered draft_email with structured context.",
      ),
    });
  }

  const webSearchCalls = toolCalls.filter((call) => call.name === "web_search");
  if (webSearchCalls.length > 0) {
    const latest = webSearchCalls[webSearchCalls.length - 1]?.arguments as { query?: string } | undefined;
    steps.push({
      title: "Investigate public sources",
      detail: normalizeWhitespace(
        latest?.query
          ? `Analysed ${webSearchCalls.length} search sweeps. Latest query ${latest.query}.`
          : `Analysed ${webSearchCalls.length} search sweeps across the public web.`,
      ),
    });
  }

  if (emailDeliverables[0]) {
    const deliverable = emailDeliverables[0];
    const variantCount = Array.isArray(deliverable.variants) ? deliverable.variants.length : 0;
    const keyPointCount = Array.isArray(deliverable.metadata?.keyPoints)
      ? (deliverable.metadata.keyPoints as unknown[]).length
      : 0;
    steps.push({
      title: "Assemble final response",
      detail: normalizeWhitespace(
        `Prepared subject ${deliverable.subject}, surfaced ${variantCount + 1} variants, and reflected ${keyPointCount} key points.`,
      ),
    });
  }

  if (researchDeliverables[0]) {
    const brief = researchDeliverables[0].deliverable;
    steps.push({
      title: "Synthesize research brief",
      detail: normalizeWhitespace(
        `Compiled ${brief.keyFindings.length} findings with ${brief.recommendations.length} recommended actions for ${brief.topic}.`,
      ),
    });
  }

  return steps;
};

const buildSources = (
  emailDeliverables: EmailDraftDeliverable[],
  researchDeliverables: ResearchBriefPart[],
  toolCalls: ToolInteraction[],
  threadId: string,
): SourceItem[] => {
  const sources: SourceItem[] = [];

  if (emailDeliverables[0]) {
    const deliverable = emailDeliverables[0];
    const keyPoints = Array.isArray(deliverable.metadata?.keyPoints)
      ? (deliverable.metadata.keyPoints as string[])
      : [];

    keyPoints.forEach((point, index) => {
      sources.push({
        id: `${deliverable.runId ?? threadId}-kp-${index}`,
        title: point,
        description: "Key point supplied by the operator",
        url: `https://sidekick.local/runs/${deliverable.runId ?? threadId}#kp-${index + 1}`,
        badge: "Operator context",
      });
    });

    const draftCall = toolCalls.find((call) => call.name === "draft_email");
    if (draftCall) {
      sources.push({
        id: `${deliverable.runId ?? threadId}-tool-${draftCall.id}`,
        title: "Draft email specialist",
        description: "Specialist agent synthesis for email formatting",
        url: `https://sidekick.local/runs/${deliverable.runId ?? threadId}`,
        badge: "Specialist",
      });
    }
  }

  for (const part of researchDeliverables) {
    part.deliverable.sources.forEach((source, index) => {
      const description = [
        source.description,
        source.publishedAt ? `Published ${source.publishedAt}` : undefined,
      ]
        .filter(Boolean)
        .join("  ");

      sources.push({
        id: source.id ?? `${part.runId}-source-${index}`,
        title: source.title,
        description: description || undefined,
        url: source.url,
        badge: source.badge ?? "Research source",
      });
    });
  }

  const seen = new Set<string>();
  return sources.filter((source) => {
    if (seen.has(source.id)) return false;
    seen.add(source.id);
    return true;
  });
};

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const incomingMessages: unknown[] = Array.isArray(payload?.messages) ? payload.messages : [];
    const lastUserMessage = [...incomingMessages].reverse().find((message) => (message as any)?.role === "user");
    const userText = extractIncomingMessageText(lastUserMessage);

    if (!userText) {
      return NextResponse.json({ error: "No user message provided." }, { status: 400 });
    }

    const { id: threadId, session } = getOrCreateSession(payload?.threadId ?? "default-thread");
    const apiKey = process.env.OPENAI_API_KEY;

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const messageId = `assistant-text-${Date.now()}`;
        writer.write({ type: "text-start", id: messageId });

        let closed = false;
        const finalize = () => {
          if (closed) return;
          closed = true;
          writer.write({ type: "text-end", id: messageId });
          const closable = writer as { close?: () => void };
          closable.close?.();
        };

        if (!apiKey) {
          writer.write({
            type: "text-delta",
            id: messageId,
            delta: "The orchestrator is unavailable because OPENAI_API_KEY is not configured.",
          });
          finalize();
          return;
        }

        try {
          const provider = new OpenAIProvider({ apiKey });
          const runner = new Runner({
            modelProvider: provider,
            model: "gpt-5-mini",
            modelSettings: {
              reasoning: { effort: "low" },
              text: { verbosity: "low" },
            },
            traceMetadata: {
              workflow_id: session.context.workflowId,
              run_id: session.context.runId,
              intent: session.context.intent,
            },
          });

          const historyWithUser = [...session.history, toUserMessage(userText)];
          const run = await runner.run(orchestratorAgent, historyWithUser, {
            context: session.context,
            stream: true,
          });

          let textDelivered = false;
          const reasoningId = `${messageId}-reasoning`;
          const reasoningBuffer = new Map<string, string>();

          const emitReasoningUpdate = (status: "in-progress" | "completed") => {
            if (reasoningBuffer.size === 0) return;
            const steps = Array.from(reasoningBuffer.values()).map((detail, index) => ({
              title: `Thought ${index + 1}`,
              detail: normalizeWhitespace(detail),
            }));
            writer.write({
              type: "data-reasoning",
              id: reasoningId,
              data: {
                headline: status === "in-progress" ? "Investigating" : "How the orchestrator responded",
                status,
                steps,
              },
            });
          };

          for await (const event of run) {
            if (event.type === "raw_model_stream_event") {
              const data = event.data as any;
              if (data?.type === "response.output_text.delta" && typeof data.delta === "string") {
                writer.write({ type: "text-delta", id: messageId, delta: data.delta });
                textDelivered = true;
              }

              if (data?.type === "response.error") {
                const errorMessage = data.error?.message ?? "The model reported an error.";
                writer.write({ type: "text-delta", id: messageId, delta: `Error: ${errorMessage}` });
                textDelivered = true;
                break;
              }
            }

            if (event.type === "run_item_stream_event") {
              const name = (event as any).name as string | undefined;
              if (name === "reasoning_item_created" || name === "reasoning_item_delta") {
                const detail = extractReasoningText(event.item);
                if (detail) {
                  const key = (event.item as any)?.rawItem?.id ?? `step-${reasoningBuffer.size}`;
                  reasoningBuffer.set(key, detail);
                  emitReasoningUpdate("in-progress");
                }
              }

              if (name === "reasoning_summary" && typeof (event.item as any)?.summary === "string") {
                reasoningBuffer.set(`summary-${reasoningBuffer.size}`, (event.item as any).summary);
                emitReasoningUpdate("in-progress");
              }
            }
          }

          await run.completed;

          const history = run.history;
          updateSessionHistory(threadId, history);

          const newItems = history.slice(historyWithUser.length);
          const toolInteractions = extractToolInteractions(newItems);
          const emailDeliverables = extractEmailDeliverables(newItems);
          const researchPlans = extractResearchPlans(newItems);
          const researchDeliverables = extractResearchDeliverables(newItems);

          if (!textDelivered) {
            const fallbackText = collectAssistantText(newItems);
            if (fallbackText) {
              writeTextChunks(writer, messageId, fallbackText);
              textDelivered = fallbackText.length > 0;
            }
          }

          if (!textDelivered) {
            writer.write({ type: "text-delta", id: messageId, delta: "No assistant response generated." });
          }

          emitReasoningUpdate("completed");

          toolInteractions.forEach((interaction, index) => {
            writer.write({
              type: "data-tool",
              id: `${messageId}-tool-${index}`,
              data: {
                name: interaction.name,
                status: interaction.status,
                arguments: interaction.arguments,
                result: interaction.result,
              },
            });
          });

          const sources = buildSources(emailDeliverables, researchDeliverables, toolInteractions, threadId);
          if (sources.length > 0) {
            writer.write({
              type: "data-sources",
              id: `${messageId}-sources`,
              data: sources,
            });
          }

          researchPlans.forEach((part, index) => {
            writer.write({
              type: "data-research-plan",
              id: `${messageId}-research-plan-${index}`,
              data: {
                objective: part.plan.objective,
                constraints: part.plan.constraints ?? [],
                tasks: part.plan.tasks.map((task, taskIndex) => ({
                  id: `${part.runId}-task-${taskIndex}`,
                  title: task.title,
                  detail: task.detail,
                  modality: task.modality ?? null,
                  successCriteria: task.successCriteria ?? null,
                })),
                budgets: {
                  webSearches: part.plan.budgets?.webSearches ?? null,
                  fileSearches: part.plan.budgets?.fileSearches ?? null,
                  followUpIterations: part.plan.budgets?.followUpIterations ?? null,
                  timeboxMinutes: part.plan.budgets?.timeboxMinutes ?? null,
                  notes: part.plan.budgets?.notes ?? null,
                },
                recencyWindow: part.plan.recencyWindow ?? null,
                openQuestions: part.plan.openQuestions ?? [],
                deliverableExpectation: part.plan.deliverableExpectation ?? null,
                metadata: part.plan.metadata ?? {},
                runId: part.runId,
              },
            });
          });

          emailDeliverables.forEach((deliverable, index) => {
            writer.write({
              type: "data-email-draft",
              id: `${messageId}-email-${index}`,
              data: {
                subject: deliverable.subject,
                body: deliverable.body,
                variants: deliverable.variants,
                metadata: deliverable.metadata,
                cacheKey: deliverable.cacheKey,
                runId: deliverable.runId,
                identicalToExisting: deliverable.identicalToExisting,
              },
            });
          });

          researchDeliverables.forEach((part, index) => {
            writer.write({
              type: "data-research-brief",
              id: `${messageId}-research-${index}`,
              data: {
                topic: part.deliverable.topic,
                summary: part.deliverable.summary,
                keyFindings: part.deliverable.keyFindings.map((finding) => ({
                  title: finding.title,
                  insight: finding.insight,
                  confidence: finding.confidence ?? null,
                  citations: finding.citations ?? [],
                })),
                recommendations: part.deliverable.recommendations.map((recommendation) => ({
                  action: recommendation.action,
                  rationale: recommendation.rationale ?? null,
                  priority: recommendation.priority ?? null,
                  citations: recommendation.citations ?? [],
                })),
                followUps: part.deliverable.followUps ?? [],
                sources: part.deliverable.sources.map((source) => ({
                  id: source.id,
                  title: source.title,
                  description: source.description ?? null,
                  url: source.url ?? null,
                  badge: source.badge ?? null,
                  publishedAt: source.publishedAt ?? null,
                })),
                metadata: part.deliverable.metadata ?? {},
                cacheKey: part.cacheKey,
                runId: part.runId,
                identicalToExisting: part.identicalToExisting,
              },
            });
          });
        } catch (error) {
          console.error("Chat orchestrator failed.", error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          writer.write({ type: "text-delta", id: messageId, delta: `Error: ${errorMessage}` });
        } finally {
          finalize();
        }
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Chat orchestrator failed." }, { status: 500 });
  }
}
