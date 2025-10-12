# Repository Guidelines

## Project Structure & Module Organization
- pp/: Next.js App Router pages, layouts, and API mocks. Feature folders (dashboard/, settings/, etc.) keep UI, routes, and handlers co-located.
- components/: Reusable client components (chat panel, shell, widgets). Keep feature-specific state outside this directory.
- store/, hooks/, models/, data/: Shared Zustand state, streaming helpers, types, and deterministic fixtures backing the UI.
- 	ests/: Vitest suites (*.test.ts) targeting stores and utilities. Add new files mirroring source names.

## Build, Test, and Development Commands
- 
pm run dev — Start the Next.js 15 dev server with Tailwind v4 preview and mock APIs.
- 
pm run build — Generate the production bundle; run before release branches.
- 
pm run start — Serve the compiled bundle for smoke testing.
- 
pm run test — Execute Vitest suites in CI-friendly mode.
- 
pm run lint — ESLint (Next preset) for React/TypeScript code health.
- 
pm run typecheck — Strict TypeScript validation without emit.

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

We carry agent telemetry as **UI-message parts** alongside assistant text. Keep types tiny and stable.

```ts
// Shared types
export type AgentEvent =
  | { type: 'token';  delta: string }
  | { type: 'tool';   progress: { tool: string; status: 'started' | 'delta' | 'completed' | 'error'; data?: unknown } }
  | { type: 'handoff'; from: string; to: string; reason?: string }
  | { type: 'trace';  runId: string; step: string; meta?: Record<string, unknown> }
  | { type: 'final';  message: string; annotations?: Record<string, unknown> };

export type UIMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;          // Plain text content (concatenate deltas server-side)
  parts?: AgentEvent[];     // Agent events for SideKick panes (runs, activity)
  threadId?: string;
  runId?: string;
};
```

---

## Client (UI): useChat

```tsx
"use client";
import { useChat } from "ai/react";

export function WorkbenchChat() {
  const { messages, input, setInput, handleSubmit, isLoading, stop } =
    useChat<UIMessage>({ api: "/api/chat" });

  // Render with shadcn/ui or AI Elements components
  // (Messages list + Composer wrapped in your app shell)
  /* ... */
}
```

> `useChat` (v5) manages chat state and streaming over a transport; you handle layout/theming. ([ai-sdk.dev][1])

---

## Server Bridge (UI stream): Agents → UI parts

Use **AI SDK v5** helpers to stream UI messages. Maintain **stable IDs** across `text-start` → `text-delta`* → `text-end`.

```ts
// app/api/chat/route.ts (Next.js App Router)
import { createUIMessageStream, createUIMessageStreamResponse, type UIMessage as SDKUIMessage } from "ai";

export type MyUIMessage = SDKUIMessage & { parts?: AgentEvent[]; threadId?: string; runId?: string };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { messages, threadId } = await req.json();

  // Run the agents orchestrator and translate its events to UI parts.
  // Here we stub it with a simple echo & a trace event.
  const stream = createUIMessageStream<MyUIMessage>({
    execute: async ({ writer }) => {
      const id = "assistant-text-1";

      // Start a text block
      writer.write({ type: "text-start", id });

      const text = `Okay — thread ${threadId ?? "new"}. How can I help? `;
      for (const ch of text) writer.write({ type: "text-delta", id, delta: ch });

      // Optional: attach a trace/telemetry part (rendered in SideKick activity pane)
      writer.write({ type: "data", value: { parts: [{ type: "trace", runId: "run_123", step: "router:init" }] } });

      // End the text block and close
      writer.write({ type: "text-end", id });
      writer.close();
    },
  });

  return createUIMessageStreamResponse({ stream });
}
```

> `createUIMessageStream` / `createUIMessageStreamResponse` are the v5 primitives for server→client UI streaming. ([ai-sdk.dev][5])

---

## Orchestration: OpenAI Agents SDK

Model the workflow as **Router → Sub-agents** with tools, handoffs, guardrails, and **built-in tracing**. ([openai.github.io][2])

```ts
import { Agents, Handoff } from "@openai/agents";

const support = Agents.create({
  name: "Support",
  model: "gpt-4.1-mini",
  instructions: "Be concise and helpful.",
  tools: [],
});

const research = Agents.create({
  name: "Research",
  model: "o4-mini",
  instructions: "Search & summarize.",
  tools: [],
});

const router = Agents.create({
  name: "Router",
  model: "gpt-4.1",
  instructions: "Route by intent.",
  tools: [Handoff.to(support), Handoff.to(research)],
});

// Streaming run; forward events to the UI stream writer
export async function runAgentGraphStream(call: { messages: UIMessage[]; threadId?: string }, h: {
  onToken: (delta: string) => void;
  onTool: (p: AgentEvent['progress']) => void;
  onHandoff: (e: Omit<Extract<AgentEvent,{type:'handoff'}>,'type'>) => void;
  onTrace: (runId: string, step: string, meta?: any) => void;
  onFinal: (msg: string, ann?: any) => void;
  onError: (err: unknown) => void;
}) {
  await Agents.run({
    entry: router,
    messages: call.messages,
    context: { threadId: call.threadId },
    onEvent(e) {
      if (e.type === "token")          h.onToken(e.delta);
      if (e.type === "tool-start")     h.onTool({ tool: e.tool, status: "started" });
      if (e.type === "tool-delta")     h.onTool({ tool: e.tool, status: "delta", data: e.delta });
      if (e.type === "tool-end")       h.onTool({ tool: e.tool, status: "completed", data: e.result });
      if (e.type === "handoff")        h.onHandoff({ from: e.from, to: e.to, reason: e.reason });
      if (e.type === "trace")          h.onTrace(e.runId, e.step, e.meta);
      if (e.type === "error")          h.onError(e.error);
      if (e.type === "final")          h.onFinal(e.message, e.annotations);
    },
  });
}
```

> The Agents SDK exposes **handoffs**, **guardrails**, and **tracing**; inspect runs in the OpenAI Traces dashboard. ([openai.github.io][6])

---

## Wiring the Bridge

Replace the stubbed text in the route with a call to `runAgentGraphStream`, forwarding events into the UI stream:

```ts
const stream = createUIMessageStream<MyUIMessage>({
  execute: async ({ writer }) => {
    const id = "assistant-text-1";
    writer.write({ type: "text-start", id });

    await runAgentGraphStream({ messages, threadId }, {
      onToken:  d => writer.write({ type: "text-delta", id, delta: d }),
      onTool:   p => writer.write({ type: "data", value: { parts: [{ type: "tool", progress: p }] } }),
      onHandoff:e => writer.write({ type: "data", value: { parts: [{ type: "handoff", ...e }] } }),
      onTrace:  (runId, step, meta) => writer.write({ type: "data", value: { parts: [{ type: "trace", runId, step, meta }] } }),
      onFinal:  (msg) => { writer.write({ type: "text-delta", id, delta: msg }); },
      onError:  (err) => { writer.write({ type: "text-delta", id, delta: String(err) }); }
    });

    writer.write({ type: "text-end", id });
    writer.close();
  },
});
```

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

* `USE_AGENTS_SDK=true|false` — when false, fall back to provider **Responses** streaming to keep UI functioning.

---

## Known Pitfalls (and fixes)

1. **RSC vs UI**: Don’t default to RSC `streamUI`. Use `useChat` + UI stream for production; RSC is experimental. ([ai-sdk.dev][3])
2. **Stream IDs**: Keep a **stable text block ID** across `text-start`/`delta`/`end`.
3. **Hydration**: Client-only libraries (e.g., Recharts) must be dynamically imported with `ssr:false`.
4. **Next.js SSE**: Mark SSE routes `runtime="nodejs"` and `dynamic="force-dynamic"` to avoid static optimization.
5. **Deep UI overrides**: If you need prebuilt chat, use **AI Elements** (shadcn-based) to avoid hand-coding scroll/stream edge cases. ([shadcn.io][8])

---

## One-Page Checklist

* [ ] Client uses `useChat<UIMessage>({ api: "/api/chat" })`. ([ai-sdk.dev][1])
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


