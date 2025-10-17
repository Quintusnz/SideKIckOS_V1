import { NextRequest, NextResponse } from "next/server";
import { Runner, type AgentInputItem, OpenAIProvider } from "@openai/agents";
import { createUIMessageStream, createUIMessageStreamResponse, type UIMessage } from "ai";
import { orchestratorAgent } from "@/server/agents/agents/orchestrator";
import { getOrCreateSession, updateSessionHistory } from "@/server/agents/conversation-store";

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

const extractAssistantText = (item: AgentInputItem) => {
  if ((item as any).role !== "assistant") return "";
  const content = (item as any).content ?? [];
  return content
    .filter((part: any) => part?.type === "output_text")
    .map((part: any) => part.text ?? "")
    .join("")
    .trim();
};

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

type EmailDraftDeliverable = {
  subject: string;
  body: string;
  variants: Array<{ label: string; body: string }>;
  metadata: Record<string, unknown>;
  cacheKey: string;
  runId: string;
  identicalToExisting: boolean;
};

type EmailDraftPart = {
  type: "email-draft";
  deliverable: EmailDraftDeliverable;
};

type OrchestratorUIMessage = UIMessage & {
  parts?: EmailDraftPart[];
};

type ToolInteraction = {
  id: string;
  name: string;
  status: "started" | "completed" | "error";
  arguments?: unknown;
  result?: unknown;
};

type ReasoningStep = {
  title: string;
  detail: string;
};

type SourceItem = {
  id: string;
  title: string;
  description?: string;
  url?: string;
  badge?: string;
};

const safeParseJSON = (value: unknown) => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const normalizeDetail = (detail: string) => detail.trim().replace(/\s+/g, " ");

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
  }

  return Array.from(calls.values());
};

const buildReasoning = (
  userText: string,
  toolCalls: ToolInteraction[],
  deliverable: EmailDraftDeliverable | undefined,
): ReasoningStep[] => {
  const steps: ReasoningStep[] = [];

  if (userText) {
    const preview = userText.length > 160 ? `${userText.slice(0, 157)}…` : userText;
    steps.push({
      title: "Understand operator request",
      detail: normalizeDetail(`Parsed the latest prompt: “${preview}”`),
    });
  }

  const draftCall = toolCalls.find((call) => call.name === "draft_email");
  if (draftCall) {
    const argsSummary = (() => {
      const args = draftCall.arguments as Record<string, unknown> | undefined;
      if (!args || typeof args !== "object") return undefined;
      const { recipient, tone, keyPoints } = args as {
        recipient?: string;
        tone?: string;
        keyPoints?: unknown;
      };
      const points = Array.isArray(keyPoints) ? keyPoints.length : undefined;
      const parts: string[] = [];
      if (recipient && typeof recipient === "string") parts.push(`recipient ${recipient}`);
      if (tone && typeof tone === "string") parts.push(`tone ${tone}`);
      if (typeof points === "number") parts.push(`${points} key points`);
      return parts.join(", ");
    })();

    steps.push({
      title: "Delegate to drafting specialist",
      detail: normalizeDetail(
        argsSummary
          ? `Called draft_email with ${argsSummary}.`
          : "Triggered draft_email with structured context.",
      ),
    });
  }

  if (deliverable) {
    const { metadata, variants, subject } = deliverable;
    const variantCount = Array.isArray(variants) ? variants.length : 0;
    const keyPointCount = Array.isArray(metadata?.keyPoints) ? metadata.keyPoints.length : 0;
    steps.push({
      title: "Assemble final response",
      detail: normalizeDetail(
        `Prepared subject “${subject}”, rephrased ${variantCount + 1} variants, and reflected ${keyPointCount} key points.`,
      ),
    });
  }

  return steps;
};

const buildSources = (
  deliverable: EmailDraftDeliverable | undefined,
  toolCalls: ToolInteraction[],
  threadId: string,
): SourceItem[] => {
  if (!deliverable) return [];

  const keyPoints = Array.isArray(deliverable.metadata?.keyPoints)
    ? (deliverable.metadata?.keyPoints as string[])
    : [];

  const sourcesFromKeyPoints: SourceItem[] = keyPoints.map((point, index) => ({
    id: `${deliverable.runId ?? threadId}-kp-${index}`,
    title: point,
    description: "Key point supplied by the operator",
    url: `https://sidekick.local/runs/${deliverable.runId ?? threadId}#kp-${index + 1}`,
    badge: "Operator context",
  }));

  const draftCall = toolCalls.find((call) => call.name === "draft_email");
  const toolSource: SourceItem[] = draftCall
    ? [
        {
          id: `${deliverable.runId ?? threadId}-tool-${draftCall.id}`,
          title: "Draft email specialist",
          description: "Specialist agent synthesis for email formatting",
          url: `https://sidekick.local/runs/${deliverable.runId ?? threadId}`,
          badge: "Specialist",
        },
      ]
    : [];

  return [...sourcesFromKeyPoints, ...toolSource];
};

const extractDeliverableParts = (items: AgentInputItem[]): EmailDraftPart[] | undefined => {
  const deliverables: EmailDraftDeliverable[] = [];

  for (const item of items) {
    if ((item as any).type !== "function_call_result" || (item as any).name !== "draft_email") continue;

    const output = (item as any).output;
    let parsed: any;

    if (typeof output === "string") {
      try {
        parsed = JSON.parse(output);
      } catch (error) {
        console.error("Failed to parse draft_email tool output", error);
        continue;
      }
    } else if (output && typeof output === "object") {
      if ((output as any).type === "text" && typeof (output as any).text === "string") {
        try {
          parsed = JSON.parse((output as any).text);
        } catch (error) {
          console.error("Failed to parse draft_email tool output", error);
          continue;
        }
      } else {
        parsed = output;
      }
    }

    if (parsed?.subject && parsed?.body) {
      deliverables.push(parsed);
    }
  }

  if (deliverables.length === 0) return undefined;
  return deliverables.map((deliverable) => ({ type: "email-draft" as const, deliverable }));
};

const writeTextChunks = (
  writer: { write: (chunk: any) => void },
  id: string,
  text: string,
) => {
  if (!text) return;
  const normalized = text.replace(/\r\n/g, "\n");
  if (!normalized.trim()) {
    writer.write({ type: "text-delta", id, delta: normalized });
    return;
  }
  const chunkSize = 300;
  for (let index = 0; index < normalized.length; index += chunkSize) {
    const delta = normalized.slice(index, index + chunkSize);
    writer.write({ type: "text-delta", id, delta });
  }
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
    const userItem = toUserMessage(userText);
    const apiKey = process.env.OPENAI_API_KEY;

    const stream = createUIMessageStream<OrchestratorUIMessage>({
      execute: async ({ writer }) => {
        const messageId = `assistant-text-${Date.now()}`;
        writer.write({ type: "text-start", id: messageId });

        let closed = false;
        const finalize = () => {
          if (closed) return;
          closed = true;
          writer.write({ type: "text-end", id: messageId });
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
            model: "gpt-5",
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

          const historyWithUser = [...session.history, userItem];
          const result = await runner.run(orchestratorAgent, historyWithUser, { context: session.context });
          const history = result.history;
          updateSessionHistory(threadId, history);

          const newItemsStartIndex = historyWithUser.length;
          const newItems = history.slice(newItemsStartIndex);
          const assistantMessages = newItems
            .map((item) => extractAssistantText(item))
            .filter((text) => text.length > 0);

          const textResponse = assistantMessages.join("\n\n");
          if (textResponse) {
            writeTextChunks(writer, messageId, textResponse);
          } else {
            writer.write({ type: "text-delta", id: messageId, delta: "No assistant response generated." });
          }

          const deliverableParts = extractDeliverableParts(newItems);
          const toolInteractions = extractToolInteractions(newItems);
          const primaryDeliverable = deliverableParts?.[0]?.deliverable;

          const reasoningSteps = buildReasoning(userText, toolInteractions, primaryDeliverable);
          if (reasoningSteps.length > 0) {
            writer.write({
              type: "data-reasoning",
              id: `${messageId}-reasoning`,
              data: {
                headline: "How the orchestrator responded",
                steps: reasoningSteps,
              },
            });
          }

          if (toolInteractions.length > 0) {
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
          }

          if (primaryDeliverable) {
            const sources = buildSources(primaryDeliverable, toolInteractions, threadId);
            if (sources.length > 0) {
              writer.write({
                type: "data-sources",
                id: `${messageId}-sources`,
                data: sources,
              });
            }
          }

          if (deliverableParts?.length) {
            deliverableParts.forEach((part, index) => {
              writer.write({
                type: "data-email-draft",
                id: `${messageId}-email-${index}`,
                data: part.deliverable,
              });
            });
          }
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

