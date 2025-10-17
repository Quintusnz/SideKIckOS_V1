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

