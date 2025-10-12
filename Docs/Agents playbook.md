# SideKick Agents Playbook
*A focused, copy-pasteable guide for building reliable agents with the OpenAI Agents SDK—tailored to your SideKick runtime.*

---

## 0) What this is
This **playbook.md** distills patterns, conventions, and snippets that slot cleanly into your existing SideKick runtime (`server/agents/runtime.ts`). It’s opinionated to prevent the “request aborted / race conditions / missing context” class of failures, while keeping agents small, typed, and observable.

---

## 1) Core Principles

- **Single-responsibility agents**: Orchestrator vs. Specialists (Research, Email).
- **Atomic turns**: If you hand off or call a “final” tool, do not also send a normal assistant message in that turn.
- **Typed outputs**: Use Zod on agents that produce structures; validate tool inputs/outputs.
- **Deterministic tools**: Defensive validation, truncation, dedupe, idempotency on writes.
- **Predictable orchestration**: Orchestrator only decides and delegates—no drafting work.
- **Visibility by default**: `traceMetadata` + `store: true` for agents that matter.
- **Guardrails at the edges**: Pre-check user input and post-check tool/agent outputs if needed.

---

## 2) Folder & Naming Conventions (suggested)

```
server/
  agents/
    runtime.ts                 // main runtime & step helpers (you have this)
    agents/
      orchestrator.ts          // Orchestrator
      research.ts              // Research Synthesizer
      email.ts                 // Email Draft Builder
    tools/
      search-web.ts            // search_web tool
      fetch-content.ts         // fetch_content tool
      report-result.ts         // report_result tool
    guardrails/
      index.ts                 // guardrail helpers (optional)
  runs/
    store.ts                   // runStore you already have
  providers/
    search.ts                  // performSearch
    fetcher.ts                 // fetchContent
```

Keep each agent/tool in its own file. It keeps diffs small and makes unit tests easier.

---

## 3) SideKick Runtime: Contracts to Honor

**Context resolution**
- `resolveContext(runContext)` must be **defensive** and return `undefined` if the carrier is malformed.
- All step functions (`startStep`, `completeStep`) should **no-op** if context or step def is missing.

**Step updates**
- Treat progress as cosmetic; never let step telemetry crash a run.
- Normalize progress (0–99 for running, 100 for done).

**Deliverables**
- `report_result` is **idempotent** (short-circuit if deliverable already exists for runId).

---

## 4) Agent Templates (drop-in)

### 4.1 Orchestrator (atomic handoff only)
```ts
// server/agents/agents/orchestrator.ts
import { Agent } from '@openai/agents';
import { promptWithHandoffInstructions } from '@openai/agents-core/extensions';
import type { WorkflowRunContext } from '../runtime';
import { resolveContext } from '../runtime'; // export it from runtime for reuse
import { researchAgent } from './research';
import { emailAgent } from './email';

export const orchestratorAgent = Agent.create<WorkflowRunContext>({
  name: 'SideKick Orchestrator',
  handoffDescription: 'Routes work to the correct specialist based on workflow ID.',
  instructions: (runContext) => {
    const ctx = resolveContext(runContext);
    if (!ctx) return 'Workflow context unavailable; wait for the driver to retry.';
    const plan = ctx.planSteps.map((s, i) => `${i + 1}. ${s}`).join('\n');
    const prompt = `You are the Orchestrator.
Workflow ID: ${ctx.workflow.id}
User intent: ${ctx.intent}

Rules:
- If "web-research" => immediately call the Research Synthesizer handoff (no normal assistant text).
- If "email-draft" => immediately call the Email Draft Builder handoff (no normal assistant text).
- Do NOT call report_result yourself.
- Turns must be atomic when handing off.`;
    return promptWithHandoffInstructions(`${prompt}\n\nPlan:\n${plan}`);
  },
  handoffs: [researchAgent, emailAgent],
  model: 'gpt-5',
  modelSettings: {
    reasoning: { effort: 'high' },
    text: { verbosity: 'medium' },
  },
});
```

### 4.2 Research Specialist (typed brief)
```ts
// server/agents/agents/research.ts
import { Agent } from '@openai/agents';
import { z } from 'zod';
import type { WorkflowRunContext } from '../runtime';
import { searchWebTool } from '../tools/search-web';
import { fetchContentTool } from '../tools/fetch-content';
import { reportResultTool, researchDeliverableSchema } from '../tools/report-result';

export const researchAgent = new Agent<WorkflowRunContext>({
  name: 'Research Synthesizer',
  handoffDescription: 'Synthesizes sources into a research brief.',
  instructions: (runCtx) => {
    const ctx = (runCtx as any).context as WorkflowRunContext;
    const plan = ctx.planSteps.map((s, i) => `${i + 1}. ${s}`).join('\n');
    return `Create a concise research brief for intent "${ctx.intent}".
- Use search_web; fetch_content if deeper context is needed.
- Cite only URLs obtained via tools using [label](url).
- Do not call report_result until you have >= 2 key findings and >= 1 citation.
- When calling report_result, do not emit normal assistant text in the same turn.

Plan:
${plan}`;
  },
  tools: [searchWebTool, fetchContentTool, reportResultTool],
  model: 'gpt-5',
  modelSettings: {
    reasoning: { effort: 'high' },
    text: { verbosity: 'medium' },
  },
});
```

### 4.3 Email Specialist (variants)
```ts
// server/agents/agents/email.ts
import { Agent } from '@openai/agents';
import type { WorkflowRunContext } from '../runtime';
import { reportResultTool } from '../tools/report-result';

export const emailAgent = new Agent<WorkflowRunContext>({
  name: 'Email Draft Builder',
  handoffDescription: 'Produces a clear primary draft and 2–3 variants.',
  instructions: (runCtx) => {
    const ctx = (runCtx as any).context as WorkflowRunContext;
    const style = JSON.stringify(ctx.stylePreferences ?? {});
    const shape = `{
  "type": "email-draft",
  "payload": {
    "subject": "...",
    "body": "...",
    "variants": [{ "label": "...", "body": "..." }],
    "tone": "...",
    "callToAction": "..."
  }
}`;
    return `Craft a ready-to-send email for intent "${ctx.intent}".
- Honor style preferences: ${style}
- Primary draft: concise, actionable, 3+ sentences.
- Provide 2–3 labeled variants (tone/angle).
- Call report_result with the JSON shaped like:
${shape}
- Do NOT emit normal assistant text in the same turn as report_result.`;
  },
  tools: [reportResultTool],
  model: 'gpt-5-mini',
  modelSettings: {
    reasoning: { effort: 'low' },
    text: { verbosity: 'low' },
  },
});
```

---

## 5) Tool Templates (defensive)

### 5.1 `search_web` (dedupe, telemetry, clear errors)
```ts
// server/agents/tools/search-web.ts
import { tool } from '@openai/agents';
import { z } from 'zod';
import type { WorkflowRunContext } from '../runtime';
import { performSearch } from '@/server/providers/search';
import { resolveContext, startStep, completeStep, updateStep, ACT } from '../runtime';

export const searchWebTool = tool<WorkflowRunContext>({
  name: 'search_web',
  description: 'Find reputable sources; returns title, url, snippet.',
  parameters: z.object({ query: z.string().min(3) }),
  async execute({ query }, runCtx) {
    startStep(runCtx, 'searcher', `Searching "${query}"`);
    try {
      const results = await performSearch(query);
      const ctx = resolveContext(runCtx);
      if (ctx) {
        const seen = new Set(ctx.collectedSources.map(s => s.url));
        const unique = results.filter(r => r.url && !seen.has(r.url));
        ctx.collectedSources.push(...unique);
      }
      completeStep(runCtx, 'searcher', `Captured ${results.length} results`);
      return results.map((r, i) =>
        `${i + 1}. ${r.title}\nURL: ${r.url}\nSnippet: ${r.snippet ?? '—'}`).join('\n\n');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const ctx = resolveContext(runCtx);
      if (ctx) updateStep(ctx, 'searcher', { status: ACT.DONE, progress: 100, message: `Search failed: ${msg}` });
      return `Search failed: ${msg}`;
    }
  },
});
```

### 5.2 `fetch_content` (truncate & type-safe)
```ts
// server/agents/tools/fetch-content.ts
import { tool } from '@openai/agents';
import { z } from 'zod';
import type { WorkflowRunContext } from '../runtime';
import { fetchContent } from '@/server/providers/fetcher';
import { resolveContext, startStep, completeStep, updateStep, ACT } from '../runtime';

export const fetchContentTool = tool<WorkflowRunContext>({
  name: 'fetch_content',
  description: 'Fetch detail for a discovered source; returns text body.',
  parameters: z.object({ url: z.string().url(), title: z.string().nullable() }),
  async execute({ url, title }, runCtx) {
    startStep(runCtx, 'fetcher', `Fetching content for ${title ?? url}`);
    try {
      const ctx = resolveContext(runCtx);
      const match = ctx?.collectedSources.find(s => s.url === url);
      const source = match ?? { title: title ?? url, url, snippet: 'Fetched without initial snippet.' };
      const raw = await fetchContent(source as any);
      const text = typeof raw === 'string' ? raw : String(raw ?? '');
      const MAX = 8_000;
      completeStep(runCtx, 'fetcher', `Fetched ${source.title}`);
      return text.length > MAX ? `${text.slice(0, MAX)}\n[truncated]` : text;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const ctx = resolveContext(runCtx);
      if (ctx) updateStep(ctx, 'fetcher', { status: ACT.DONE, progress: 100, message: `Fetch failed: ${msg}` });
      return `Fetch failed: ${msg}`;
    }
  },
});
```

### 5.3 `report_result` (idempotent & normalized)
```ts
// server/agents/tools/report-result.ts
import { tool } from '@openai/agents';
import { z } from 'zod';
import type { WorkflowRunContext, WorkflowDeliverable, EmailDeliverable } from '../runtime';
import { researchDeliverableSchema, emailDeliverableSchema } from '../runtime';
import { handleReportResult } from '../runtime';

export { researchDeliverableSchema, emailDeliverableSchema }; // re-export for reuse

export const reportResultTool = tool<WorkflowRunContext>({
  name: 'report_result',
  description: 'Call exactly once when deliverable is ready. No assistant text in same turn.',
  parameters: z.any(),
  async execute(input, runCtx) {
    try {
      const d = input as WorkflowDeliverable;
      if (d?.type === 'research-brief') {
        return handleReportResult({ type: 'research-brief', payload: researchDeliverableSchema.parse(d.payload) }, runCtx);
      }
      if (d?.type === 'email-draft') {
        const parsed = emailDeliverableSchema.parse(d.payload);
        const variants = parsed.variants?.slice(0, 4) ?? [{ label: 'Alternative', body: parsed.body }];
        return handleReportResult({ type: 'email-draft', payload: { ...parsed, variants } as EmailDeliverable }, runCtx);
      }
      return 'Invalid deliverable type. Expect "research-brief" or "email-draft".';
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return `Unable to record result because the payload was invalid: ${msg}`;
    }
  },
});
```

---

## 6) Runner Usage (safe skeleton)

```ts
// server/agents/run-workflow.ts
import { Runner, AgentInputItem } from '@openai/agents';
import { orchestratorAgent } from './agents/orchestrator';
import { createWorkflowContext } from './runtime';

export async function runWorkflow({ runId, workflow, planSteps, intent, userText }: {
  runId: string; workflow: any; planSteps: string[]; intent: string; userText: string;
}) {
  const context = createWorkflowContext({ runId, workflow, planSteps, intent });
  const conversation: AgentInputItem[] = [{ role: 'user', content: [{ type: 'input_text', text: userText }]}];

  const runner = new Runner({
    defaultModel: 'gpt-5',
    traceMetadata: { workflow_id: workflow?.id ?? 'unknown', run_id: runId },
  });

  const res = await runner.run(orchestratorAgent, conversation, { context });
  conversation.push(...res.newItems.map(i => i.rawItem));

  return { final: res.finalOutput ?? null };
}
```

---

## 7) Guardrails (optional integration points)

**Where to run**
- **Input**: before first `Runner.run` call (user input sanitization/moderation).
- **Output**: before presenting agent/tool outputs to the UI.

**What to do on tripwire**
- **Short-circuit** with a safe explanation.
- Use anonymized/checked text when available to continue safely.

*(Implement with your preferred guardrails package; keep the interface minimal.)*

---

## 8) Error Taxonomy & Handling

| Class                          | Symptom                        | Fix                                                                 |
|---                             |---                             |---                                                                  |
| Double emission in a turn      | “Request was aborted”          | Make **handoffs** and **report_result** turns atomic (no extra text). |
| Missing context                | Tools/steps crash              | Harden `resolveContext`; make step updates no-op if missing.        |
| Oversized tool output          | Truncation in traces / aborts  | Cap to 8–20k chars, summarize, paginate if needed.                  |
| Store/write races              | Duplicate deliverables         | Check existing by `runId` and **idempotently** short-circuit.       |
| Network timeouts               | Inconsistent runs              | Wrap fetchers with timeouts; return friendly partials.              |

---

## 9) Testing & Observability

- **Snapshot prompts**: keep an eye on prompt diffs per PR.
- **Unit tests** for tools (validation, truncation, idempotency).
- **Replay traces**: set `modelSettings.store = true` where useful; add `traceMetadata` like `workflow_id`, `run_id`, `user_id`.
- **Soak tests**: long conversation runs to ensure token budgets don’t creep.

---

## 10) Copy-Paste Checklists

**Agent checklist**
- [ ] Single responsibility, short instructions
- [ ] If returning structure, define `outputType` (Zod)
- [ ] `store: true` if you want retrievability/traces
- [ ] No extra text in the same turn as **handoff** or **report_result**

**Tool checklist**
- [ ] Zod-validated params
- [ ] Truncate large outputs
- [ ] Deduplicate records (e.g., by `url`)
- [ ] Step telemetry wrapped in try/catch (no crashes)
- [ ] Idempotent writes to stores

**Runtime checklist**
- [ ] `resolveContext` defensive + exported
- [ ] `startStep/completeStep/updateStep` no-op on missing step definitions
- [ ] `handleReportResult` idempotent; normalizes variants
- [ ] Defaults: `Runner` has sensible `traceMetadata` and default model

---

## 11) Small Patterns Worth Reusing

**Guarded progress**
```ts
function normalizedProgress(status: ActivityStatus, progress = 0) {
  return status === 'done' ? 100 : Math.max(0, Math.min(99, progress));
}
```

**Idempotent deliverable set**
```ts
if (context.deliverable || runStore.getDeliverable(context.runId)) {
  return 'Result captured. Provide the end user with a polished summary referencing this deliverable.';
}
```

**Atomic turn reminder in prompts**
```ts
// Include in any agent that might call finalizing tools
'- When you call a finalizing tool, do not emit a normal assistant message in the same turn.'
```

---

## 12) Final Notes

- Keep agents **small**; put complexity in **tools** and the **runtime**.
- Use **handoffs** liberally for clean separation; it reduces misbehavior.
- Prefer **typed outputs** (Zod) for anything that isn’t plain prose.
- Never let **telemetry** (step updates) fail the run.
