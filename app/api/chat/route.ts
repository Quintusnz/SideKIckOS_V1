import { NextRequest, NextResponse } from "next/server";
import { Runner, type AgentInputItem, OpenAIProvider } from "@openai/agents";
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
    .filter((part: any) => part?.type === "output_text" || part?.type === "text")
    .map((part: any) => (typeof part === "string" ? part : part.text ?? ""))
    .join("")
    .trim();
};

const extractDeliverableParts = (items: AgentInputItem[]) => {
  const deliverables: Array<{
    subject: string;
    body: string;
    variants: Array<{ label: string; body: string }>;
    metadata: Record<string, unknown>;
    cacheKey: string;
    runId: string;
    identicalToExisting: boolean;
  }> = [];

  for (const item of items) {
    if ((item as any).type === "function_call_result" && (item as any).name === "draft_email") {
      const output = (item as any).output;
      if (output?.type === "text" && typeof output.text === "string") {
        try {
          const parsed = JSON.parse(output.text);
          if (parsed?.subject && parsed?.body) {
            deliverables.push(parsed);
          }
        } catch (error) {
          console.error("Failed to parse draft_email tool output", error);
        }
      }
    }
  }

  if (deliverables.length === 0) return undefined;
  return deliverables.map((deliverable) => ({ type: "email-draft" as const, deliverable }));
};

const createSseResponse = (message: Record<string, unknown>) => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(message)}\n\n`));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
};

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const messages: Array<{ role: string; content: string }> = payload?.messages ?? [];
    const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");

    if (!lastUserMessage?.content) {
      return NextResponse.json({ error: "No user message provided." }, { status: 400 });
    }

    const { id: threadId, session } = getOrCreateSession(payload?.threadId ?? "default-thread");
    const userItem = toUserMessage(lastUserMessage.content);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return createSseResponse({
        id: `msg-${Date.now()}`,
        role: "assistant",
        content: "The orchestrator is unavailable because OPENAI_API_KEY is not configured.",
      });
    }

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

    const previousLength = session.history.length;
    const historyWithUser = [...session.history, userItem];
    const result = await runner.run(orchestratorAgent, historyWithUser, { context: session.context });
    const history = result.history as AgentInputItem[];
    updateSessionHistory(threadId, history);

    const newHistoryItems = history.slice(previousLength);
    const assistantMessages = newHistoryItems
      .filter((item) => (item as any)?.role === "assistant")
      .map((item) => extractAssistantText(item))
      .filter((text) => text.length > 0);

    const toolItems = newHistoryItems.filter((item) => (item as any)?.type === "function_call_result");
    const responseFallback = Array.isArray((result as any)?.response?.output_text)
      ? ((result as any).response.output_text as string[]).join("").trim()
      : "";
    const textResponse = assistantMessages.join("\n\n") || responseFallback;
    const parts = extractDeliverableParts(toolItems as AgentInputItem[]);

    return createSseResponse({
      id: `msg-${Date.now()}`,
      role: "assistant",
      content: textResponse,
      ...(parts ? { parts } : {}),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Chat orchestrator failed." }, { status: 500 });
  }
}
