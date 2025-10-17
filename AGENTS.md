# Repository Guidelines

## Project Structure & Module Organization
- app/: Next.js App Router pages, layouts, and API mocks. Feature folders (dashboard/, settings/, etc.) keep UI, routes, and handlers co-located.
- components/: Reusable client components (chat panel, shell, widgets). Keep feature-specific state outside this directory.
- store/, hooks/, models/, data/: Shared Zustand state, streaming helpers, types, and deterministic fixtures backing the UI.
- tests/: Vitest suites (*.test.ts) targeting stores and utilities. Add new files mirroring source names.

## Build, Test, and Development Commands
- `npm run dev` — Start the Next.js 15 dev server with Tailwind v4 preview and mock APIs.
- `npm run build` — Generate the production bundle; run before release branches.
- `npm run start` — Serve the compiled bundle for smoke testing.
- `npm run test` — Execute Vitest suites in CI-friendly mode.
- `npm run lint` — ESLint (Next preset) for React/TypeScript code health.
- `npm run typecheck` — Strict TypeScript validation without emit.

## Coding Style & Naming Conventions
- TypeScript + functional components only; type props explicitly.
- Use camelCase for variables/functions, PascalCase for components/types, kebab-case for filenames.
- Tailwind utilities should read from layout → spacing → color → state. Avoid bespoke CSS unless tokens require it.
- Run lint/typecheck before committing; adhere to 2-space indentation (editor default).

## Testing Guidelines
- Vitest provides the testing harness; tests live in 	ests/ and use describe/it with deterministic fixtures from data/.
- Focus coverage on Zustand stores, hooks, and critical helpers. Document intentional gaps in PR notes.
- Name files <unit>.test.ts (e.g., 
uns-store.test.ts).

## Commit & Pull Request Guidelines
- Commit subjects: imperative, ≤72 chars (e.g., Stream new activity events). Include context in the body when needed.
- PRs must include: summary, command output for 	est/lint/typecheck, and UI screenshots or GIFs when visuals change.
- Keep PR scope focused; spin off follow-up issues for out-of-band work.

## Security & Configuration Tips
- Never commit secrets; mocks under pp/api/ should remain deterministic and credential-free.
- Local overrides belong in .env.local (already gitignored). Review diffs for accidental secret leakage before submission.

Here’s a tightened, **drop-in** `agents.md` addition that codifies the hybrid approach (AI SDK v5 for UI/streaming; OpenAI Agents SDK for orchestration). I’ve corrected API names, added a minimal bridge, clarified RSC vs UI, and included a short pitfalls checklist.

---

# Frontend–Orchestrator Contract (AI SDK v5 + OpenAI Agents SDK)

## Principles

* **Vercel AI SDK v5 first** for chat state and streaming on the client (`useChat`) and UI-message streaming on the server (`createUIMessageStream*`). Don’t re-invent chat/streaming; only wrap for layout/theming. ([ai-sdk.dev][1])
* **OpenAI Agents SDK** builds and runs the agent graph (router + sub-agents, tools, handoffs, guardrails, tracing). The server **bridges** agent events → UI message parts. ([openai.github.io][2])
* Prefer **AI SDK UI** (client hooks) over RSC `streamUI` for production; RSC is currently **experimental**. ([ai-sdk.dev][3])
* When you want prebuilt, shadcn-styled chat components, use **AI Elements** with AI SDK. ([ai-sdk.dev][4])

---

## Policy (non-negotiable)

* Use `useChat` from **AI SDK v5** for client chat state/streaming and only wrap with shadcn/ui. ([ai-sdk.dev][1])
* If a component/hook exists in **AI SDK v5** (or **AI Elements**), use it. Write custom UI only when required. ([ai-sdk.dev][4])
* Keep **provider API keys** and orchestration on the server. The browser never sees secrets.

---

## Message Contract

Assistant responses stream as a combination of text deltas and typed telemetry parts. These types mirror `components/chat-panel.tsx` and should stay in sync with any backend emitters.

```ts
export type TextPart = {
  type: "text";
  text: string;
  state?: "streaming" | "done";
};

export type ReasoningUIPart = {
  type: "data-reasoning";
  id?: string;
  data: {
    headline?: string;
    steps: Array<{ title: string; detail: string }>;
  };
};

export type ToolUIPart = {
  type: "data-tool";
  id?: string;
  data: {
    name: string;
    status: "started" | "completed" | "error";
    arguments?: unknown;
    result?: unknown;
  };
};

export type SourcesUIPart = {
  type: "data-sources";
  id?: string;
  data: Array<{
    id: string;
    title: string;
    description?: string;
    url?: string;
    badge?: string;
  }>;
};

export type EmailDraftUIPart = {
  type: "data-email-draft";
  id?: string;
  data: {
    subject: string;
    body: string;
    variants: Array<{ label: string; body: string }>;
    metadata: Record<string, unknown>;
    cacheKey: string;
    runId: string;
    identicalToExisting?: boolean;
  };
};

export type MessagePart =
  | TextPart
  | ReasoningUIPart
  | ToolUIPart
  | SourcesUIPart
  | EmailDraftUIPart;

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content?: string;
  parts?: MessagePart[];
};
```

The server always starts a stable text block via `text-start`, streams deltas (`text-delta`), and closes with `text-end`. Each telemetry payload is its own event (`data-reasoning`, `data-tool`, etc.) so the UI can render or collapse sections independently.

---

## Client (UI): `useChat`

```tsx
"use client";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

export function WorkbenchChat() {
  const { messages, status, sendMessage } = useChat<ChatMessage>({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  const isStreaming = status !== "ready";

  // Render with shadcn/ui or AI Elements components
  // (Messages list + Composer wrapped in your app shell)
  // Forward `messages` to the chat panel and count on `status`
  // for "thinking" indicators or disabling the send button.
}
```

> `DefaultChatTransport` keeps the UI hook synchronized with `createUIMessageStream`, including typed telemetry events. ([ai-sdk.dev][1])

---

## Server Bridge (UI stream): Agents → UI parts

Use **AI SDK v5** helpers to stream the orchestrator response. Maintain a stable `id` across `text-start` → `text-delta` → `text-end`, and emit each telemetry payload as the matching `data-*` event.

```ts
import { NextRequest } from "next/server";
import { Runner, OpenAIProvider } from "@openai/agents";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { orchestratorAgent } from "@/server/agents/agents/orchestrator";
import { getOrCreateSession, updateSessionHistory } from "@/server/agents/conversation-store";
// Helper utilities (see app/api/chat/route.ts in this repo)
import {
  toUserMessage,
  extractUserText,
  writeTextChunks,
  collectAssistantText,
  emitReasoning,
  emitToolTelemetry,
  emitDeliverables,
} from "./helpers";

export async function POST(request: NextRequest) {
  const payload = await request.json();
  const userText = extractUserText(payload.messages);
  const { id: sessionId, session } = getOrCreateSession(payload.threadId ?? "default-thread");

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const messageId = `assistant-text-${Date.now()}`;
      writer.write({ type: "text-start", id: messageId });

      const provider = new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY! });
      const runner = new Runner({
        modelProvider: provider,
        model: "gpt-5",
        modelSettings: {
          reasoning: { effort: "low" },
          text: { verbosity: "low" },
        },
      });

      const historyWithUser = [...session.history, toUserMessage(userText)];
      const result = await runner.run(orchestratorAgent, historyWithUser, { context: session.context });
      updateSessionHistory(sessionId, result.history);

      const newItems = result.history.slice(historyWithUser.length);
      writeTextChunks(writer, messageId, collectAssistantText(newItems));

      emitReasoning(writer, messageId, newItems, userText);
      emitToolTelemetry(writer, messageId, newItems);
      emitDeliverables(writer, messageId, newItems, sessionId);

      writer.write({ type: "text-end", id: messageId });
      writer.close();
    },
  });

  return createUIMessageStreamResponse({ stream });
}
```

`emitReasoning`, `emitToolTelemetry`, and `emitDeliverables` should call `writer.write({ type: "data-reasoning", ... })`, `writer.write({ type: "data-tool", ... })`, and `writer.write({ type: "data-email-draft", ... })` respectively so the client receives strongly typed parts. ([ai-sdk.dev][5])

---

## Orchestration: OpenAI Agents SDK

Define the orchestrator and specialists with the `Agent` class, wire up handoffs, and execute them with a shared `Runner`. ([openai.github.io][2])

```ts
import { Agent, OpenAIProvider, Runner } from "@openai/agents";
import { draftEmailTool } from "@/server/agents/tools/draft-email";

export const emailDraftAgent = new Agent({
  name: "Email Specialist",
  handoffDescription: "Produces executive-ready email drafts.",
  instructions: "...",
  model: "gpt-5",
  tools: [draftEmailTool],
});

export const orchestratorAgent = new Agent({
  name: "SideKick Orchestrator",
  instructions: "Primary assistant; routes work to specialists and summarizes outcomes.",
  handoffs: [emailDraftAgent],
  tools: [draftEmailTool],
  model: "gpt-5",
  modelSettings: {
    reasoning: { effort: "low" },
    text: { verbosity: "low" },
  },
});

const provider = new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY! });
const runner = new Runner({ modelProvider: provider, model: "gpt-5" });

const result = await runner.run(orchestratorAgent, historyWithUser, { context: sessionContext });
```

The `Runner` records every handoff, tool call, and assistant turn in `result.history`, which we transform into UI message parts for the stream.

---

## Wiring the Bridge

`app/api/chat/route.ts` already performs the bridge:

- prime a `messageId` and wrap every response in `text-start` → `text-delta` → `text-end` events;
- project `Runner` history into reasoning/tool/source/email parts with the helpers noted above;
- call `writer.write({ type: "data-reasoning" | "data-tool" | ... })` for each structured payload so the UI renders dedicated cards;
- keep the message part union and the UI renderers in sync whenever you introduce a new telemetry type.

Follow the same pattern if you add additional agent runs (e.g., workflows, research).

---

## Voice (optional)

* For duplex voice, use **Agents Realtime (WebRTC)**. Keep `/api/chat` for transcript + UI state; pipe realtime events to UI parts when needed. (See Agents SDK realtime updates.) ([OpenAI Community][7])

---

## Persistence & Observability

* Always include a `threadId` and persist `{ threadId, runId, messages }` for idempotent retries and audit.
* Leverage **Agents SDK tracing** to visualize steps, tool calls, and handoffs. Surface a subset into SideKick’s right-pane activity feed via `parts: [{ type: 'trace', ... }]`. ([openai.github.io][6])

---

## Security

* **Never** expose provider keys to the browser. Gate tool access by user/tenant. Sanitize inputs/outputs server-side.

---

## Configuration Flags

*None at present.* Document new flags here when they land.

---

## Known Pitfalls (and fixes)

1. **RSC vs UI**: Don’t default to RSC `streamUI`. Use `useChat` + UI stream for production; RSC is experimental. ([ai-sdk.dev][3])
2. **Stream IDs**: Keep a **stable text block ID** across `text-start`/`delta`/`end`.
3. **Hydration**: Client-only libraries (e.g., Recharts) must be dynamically imported with `ssr:false`.
4. **Next.js SSE**: Mark SSE routes `runtime="nodejs"` and `dynamic="force-dynamic"` to avoid static optimization.
5. **Deep UI overrides**: If you need prebuilt chat, use **AI Elements** (shadcn-based) to avoid hand-coding scroll/stream edge cases. ([shadcn.io][8])

---

## One-Page Checklist

* [ ] Client uses `useChat<ChatMessage>({ transport: new DefaultChatTransport({ api: "/api/chat" }) })`. ([ai-sdk.dev][1])
* [ ] Server uses `createUIMessageStream` → `createUIMessageStreamResponse` for streaming. ([ai-sdk.dev][5])
* [ ] Agents SDK emits events → bridge maps to `parts` and text deltas. ([openai.github.io][2])
* [ ] Tracing enabled; `runId` attached; `threadId` persisted. ([openai.github.io][6])
* [ ] No secrets in the browser.
* [ ] Optional UI via AI Elements (shadcn registry). ([ai-sdk.dev][4])

---

**Intent of this section:** lock the UI/transport primitives (AI SDK v5) while leaving orchestration free to evolve (Agents SDK graph, tools, guardrails). This gives SideKick OS a stable, testable contract between the workbench UI and the agent runtime.

[1]: https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat?utm_source=chatgpt.com "AI SDK UI: useChat"
[2]: https://openai.github.io/openai-agents-js/?utm_source=chatgpt.com "OpenAI Agents SDK TypeScript - GitHub Pages"
[3]: https://ai-sdk.dev/docs/ai-sdk-rsc?utm_source=chatgpt.com "AI SDK RSC"
[4]: https://ai-sdk.dev/elements/overview?utm_source=chatgpt.com "AI Elements - AI SDK"
[5]: https://ai-sdk.dev/docs/reference/ai-sdk-ui/create-ui-message-stream?utm_source=chatgpt.com "AI SDK UI: createUIMessageStream"
[6]: https://openai.github.io/openai-agents-js/guides/tracing/?utm_source=chatgpt.com "Tracing | OpenAI Agents SDK - GitHub Pages"
[7]: https://community.openai.com/t/updates-to-building-agents-typescript-agents-sdk-a-new-realtimeagent-feature-for-voice-agents-traces-for-realtime-and-speech-to-speech-improvements/1277152?utm_source=chatgpt.com "Updates to building agents: Typescript Agents SDK, a new ..."
[8]: https://www.shadcn.io/ai?utm_source=chatgpt.com "React Components for Conversational AI - shadcn.io"

---

### Model & Reasoning Settings

- **Default model:** `gpt-5` (set per-agent or via the runner). Use `gpt-5-mini` when you want the same reasoning stack at lower latency/cost.
- **Reasoning dial:** `modelSettings.reasoning.effort` accepts `'minimal' | 'low' | 'medium' | 'high'`. We default orchestrator runs to `'low'` and the email specialist to `'medium'`.
- **Verbosity dial:** `modelSettings.text.verbosity` controls how expansive the assistant is. Keep it on `'low'` so the email drafts stay concise.
- **Runner defaults:** `server/agents/run-email.ts` sets the runner to `gpt-5` with the same reasoning/text settings, so handoffs inherit the configuration automatically.
- **Token budget:** When raising the reasoning effort, raise `modelSettings.maxTokens` (or per-agent `maxTokens`) to leave headroom for the reflection tokens.
## Email Draft Builder (UI-ready)

- **Schemas**: `models/email.ts` exposes both `emailDraftAgentInputSchema` and `emailDraftDeliverableSchema`, shared across the runtime, tooling, and UI.
- **Specialist agent**: `server/agents/agents/email.ts` is the OpenAI Agents SDK specialist. It uses the `report_result` tool and consumes structured context (`payload`, tone, key points) to call `report_result` atomically.
- **Orchestrator**: `server/agents/agents/orchestrator.ts` performs the handoff. It inspects the runtime context and immediately routes email intents to the specialist while enforcing the atomic turn rule.
- **Runner entry**: `server/agents/run-email.ts` applies guardrails, chooses the orchestrated path when `OPENAI_API_KEY` is present, and falls back to the deterministic template (`server/agents/email-fallback.ts`) if the provider is misconfigured or the run errors.
- **Deliverable cache**: `server/agents/tools/report-result.ts` plus `server/agents/store/deliverables.ts` normalize payloads, compute an idempotent cache key, and expose `getRunOutcome`/`recordEmailDeliverable` for telemetry.
- **API contract**: `POST /api/agents/email` accepts `{ recipient, tone, keyPoints, additionalContext?, variants?, threadId? }` and returns `{ draft, metadata, cacheKey, runId, identicalToExisting, providerConfigured, fallbackUsed }` for UI consumption.
- **UI**: `components/email-draft-assistant.tsx` posts the structured payload, renders subject/body/variants with copy buttons, and surfaces banners for template mode (`providerConfigured=false`) or orchestrator fallback (`fallbackUsed=true`).

The orchestrator + specialist graph reuses the same deliverable cache for chat-driven workflows once the router is invoked elsewhere, so no contract changes are required on the UI.


