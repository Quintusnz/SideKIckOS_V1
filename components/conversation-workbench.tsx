"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  Clock,
  Loader2,
  Paperclip,
  Plus,
  Sparkles,
  User,
} from "lucide-react";
import {
  type ComponentType,
  type ReactNode,
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ChatMessage,
  EmailDraftUIPart,
  ReasoningUIPart,
  SourcesUIPart,
  TextPart,
  ToolUIPart,
} from "@/types/chat";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";
import { cn } from "@/utils/cn";

const STREAMING_STATUS_LABELS = ["Planning", "Delegating", "Composing", "Reviewing"] as const;

type StatusPhase = {
  id: string;
  label: string;
  state: "complete" | "active" | "pending";
  meta?: string;
};

type TimelineItem = {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  description: string;
  timestamp: string;
};

const placeholderTimeline: TimelineItem[] = [
  {
    id: "plan",
    label: "Deep research",
    icon: Sparkles,
    description: "Coordinated multi-agent analysis",
    timestamp: "Just now",
  },
  {
    id: "verify",
    label: "Fact checking",
    icon: CircleDashed,
    description: "Pending validation",
    timestamp: "Queued",
  },
];

const extractText = (message: ChatMessage): string => {
  if (message.content) return message.content;
  if (!Array.isArray(message.parts)) return "";
  return message.parts
    .filter((part): part is TextPart => part.type === "text")
    .map((part) => part.text)
    .join("");
};

const computePhases = ({
  latestAssistant,
  isStreaming,
}: {
  latestAssistant: ChatMessage | undefined;
  isStreaming: boolean;
}): StatusPhase[] => {
  if (!latestAssistant && !isStreaming) {
    return STREAMING_STATUS_LABELS.map((label, index) => ({
      id: label.toLowerCase(),
      label,
      state: index === 0 ? "active" : "pending",
    }));
  }

  const toolParts = latestAssistant?.parts?.filter(
    (part): part is ToolUIPart => part.type === "data-tool",
  );
  const deliverables = latestAssistant?.parts?.filter(
    (part): part is EmailDraftUIPart => part.type === "data-email-draft",
  );
  const reasoning = latestAssistant?.parts?.find(
    (part): part is ReasoningUIPart => part.type === "data-reasoning",
  );
  const responseText = latestAssistant ? extractText(latestAssistant).trim() : "";

  const basePhases: StatusPhase[] = [
    {
      id: "plan",
      label: "Planning",
      state: latestAssistant ? "complete" : isStreaming ? "active" : "active",
      meta: reasoning ? "Insights ready" : undefined,
    },
    {
      id: "delegate",
      label: "Delegating",
      state: toolParts && toolParts.length > 0 ? "complete" : isStreaming ? "active" : "pending",
      meta: toolParts && toolParts.length > 0 ? `${toolParts.length} tool${toolParts.length > 1 ? "s" : ""}` : undefined,
    },
    {
      id: "compose",
      label: "Composing",
      state: deliverables && deliverables.length > 0 ? "complete" : isStreaming ? "active" : responseText ? "complete" : "pending",
      meta: deliverables && deliverables.length > 0 ? `${deliverables.length} draft${deliverables.length > 1 ? "s" : ""}` : undefined,
    },
    {
      id: "review",
      label: "Reviewing",
      state: !isStreaming && responseText ? "complete" : isStreaming ? "active" : "pending",
    },
  ];

  const firstActive = basePhases.find((phase) => phase.state === "active");
  return basePhases.map((phase) => {
    if (phase.state !== "pending") return phase;
    if (isStreaming && !firstActive) {
      return { ...phase, state: "active" };
    }
    if (isStreaming && firstActive && phase.id === firstActive.id) {
      return { ...phase, state: "active" };
    }
    return phase;
  });
};

export function ConversationWorkbench() {
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });
  const typedMessages = messages as ChatMessage[];
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);
  const isStreaming = status !== "ready";

  const latestAssistant = useMemo(
    () => [...typedMessages].reverse().find((message) => message.role === "assistant"),
    [typedMessages],
  );

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [typedMessages]);

  const phases = useMemo(
    () => computePhases({ latestAssistant, isStreaming }),
    [latestAssistant, isStreaming],
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    void sendMessage({ text: trimmed });
    setDraft("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const form = event.currentTarget.closest("form");
      form?.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    }
  };

  return (
    <div className="flex h-full min-h-[600px] w-full gap-4 overflow-hidden rounded-3xl border border-white/10 bg-[#080b15]/95 p-4 shadow-[0_40px_120px_rgba(8,11,21,0.55)]">
      <aside className="flex w-72 flex-col rounded-2xl border border-white/10 bg-gradient-to-b from-[#121730] to-[#0d1426]">
        <header className="flex items-center justify-between border-b border-white/10 px-4 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6c7cff]">Workbench</p>
            <h2 className="text-base font-semibold text-zinc-100">Conversations</h2>
          </div>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-zinc-300 transition hover:border-white/40 hover:text-white"
          >
            <Plus className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <section className="space-y-3">
            <h3 className="px-2 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Active</h3>
            {placeholderTimeline.map((item) => (
              <button
                key={item.id}
                type="button"
                className="flex w-full items-start gap-3 rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-left text-sm text-zinc-200 transition hover:border-white/20 hover:bg-white/10"
              >
                <item.icon className="mt-0.5 h-4 w-4 text-[#4e6bff]" />
                <span>
                  <span className="block text-[15px] font-semibold text-zinc-100">{item.label}</span>
                  <span className="block text-xs text-zinc-500">{item.description}</span>
                  <span className="mt-2 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                    <Clock className="h-3 w-3" />
                    {item.timestamp}
                  </span>
                </span>
              </button>
            ))}
          </section>
        </div>
        <footer className="border-t border-white/10 px-4 py-4 text-xs text-zinc-500">
          Multi-agent workflows stream here. Select any run to focus.
        </footer>
      </aside>
      <section className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-[#0d1327] via-[#0a0f1f] to-[#070a15]">
        <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6c7cff]">Live Session</p>
            <h1 className="text-lg font-semibold text-zinc-100">Orchestrated Workbench</h1>
            <p className="text-sm text-zinc-500">Streaming agent coordination and deliverables</p>
          </div>
          <div className="flex items-center gap-2">
            {phases.map((phase) => (
              <div
                key={phase.id}
                className={cn(
                  "flex h-10 min-w-[90px] flex-col justify-center rounded-full border px-4 text-left shadow-sm transition",
                  phase.state === "complete" && "border-transparent bg-[#182041] text-[#c5d0ff]",
                  phase.state === "active" && "border-transparent bg-[#4e6bff] text-white shadow-[0_0_20px_rgba(78,107,255,0.55)]",
                  phase.state === "pending" && "border-white/10 bg-[#111629] text-zinc-500",
                )}
              >
                <span className="text-[11px] uppercase tracking-[0.25em]">{phase.label}</span>
                {phase.meta && <span className="text-[10px] text-zinc-300">{phase.meta}</span>}
              </div>
            ))}
            {isStreaming && <Loader2 className="h-4 w-4 animate-spin text-[#4e6bff]" aria-hidden />}
          </div>
        </header>
        <div ref={listRef} className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
          {typedMessages.length === 0 && (
            <div className="rounded-2xl border border-dashed border-white/10 bg-[#111629]/70 p-6 text-center text-sm text-zinc-400">
              Start a conversation to watch the orchestrator plan, delegate, and compile multi-agent workstreams.
            </div>
          )}
          {typedMessages.map((message) => {
            if (message.role === "system") return null;
            const isUser = message.role === "user";
            const textContent = extractText(message);
            const reasoningPart = message.parts?.find(
              (part): part is ReasoningUIPart => part.type === "data-reasoning",
            );
            const toolParts = message.parts?.filter(
              (part): part is ToolUIPart => part.type === "data-tool",
            );
            const sourcesPart = message.parts?.find(
              (part): part is SourcesUIPart => part.type === "data-sources",
            );
            const deliverables = message.parts?.filter(
              (part): part is EmailDraftUIPart => part.type === "data-email-draft",
            );
            const isLatestAssistantMessage = !isUser && latestAssistant?.id === message.id;

            const bubbleClasses = cn(
              "w-full max-w-3xl rounded-2xl px-5 py-4 text-sm leading-relaxed shadow-[0_16px_45px_rgba(3,6,15,0.35)]",
              isUser ? "bg-[#4e6bff] text-white" : "bg-[#12172b] text-zinc-200",
            );

            return (
              <article key={message.id} className="mx-auto flex w-full max-w-4xl flex-col gap-2">
                <div
                  className={cn(
                    "flex w-full items-end gap-3",
                    isUser ? "justify-end" : "justify-start",
                  )}
                >
                  {!isUser && (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1b233b]">
                      <Bot className="h-4 w-4 text-[#b8c4ff]" />
                    </div>
                  )}
                  <div className={bubbleClasses}>
                    <p className="whitespace-pre-wrap text-[15px]">{textContent}</p>
                    {!isUser && (
                      <div className="mt-4 space-y-3 text-sm text-zinc-300">
                        {reasoningPart && (
                          <ReasoningTrace
                            part={reasoningPart}
                            isActive={isStreaming && isLatestAssistantMessage}
                          />
                        )}
                        {toolParts && toolParts.length > 0 && <ToolsAccordion parts={toolParts} />}
                        {sourcesPart && <SourcesAccordion part={sourcesPart} />}
                        {deliverables && deliverables.length > 0 && (
                          <DeliverablesAccordion parts={deliverables} messageId={message.id} />
                        )}
                      </div>
                    )}
                  </div>
                  {isUser && (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#4e6bff]">
                      <User className="h-4 w-4 text-white" />
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        <footer className="border-t border-white/10 px-6 py-5">
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>Compose a new request</span>
              <span>Shift + Enter for newline</span>
            </div>
            <div className="flex items-end gap-3">
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-zinc-400 transition hover:border-white/40 hover:text-white"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask the orchestrator to plan, research, and assemble a workflow"
                className="flex-1 resize-none rounded-xl border border-white/10 bg-[#0f1321]/80 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-[#6c7cff] focus:outline-none focus:ring-2 focus:ring-[#6c7cff]/40"
                rows={1}
              />
              <button
                type="submit"
                disabled={status !== "ready"}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#4e6bff] px-4 text-sm font-semibold text-white transition enabled:hover:bg-[#3d56d6] disabled:cursor-not-allowed disabled:bg-[#4e6bff]/40"
              >
                {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                <span>{isStreaming ? "Working" : "Send"}</span>
              </button>
            </div>
          </form>
        </footer>
      </section>
    </div>
  );
}

type AccordionProps = {
  children: ReactNode;
  label: string;
  icon: ComponentType<{ className?: string }>;
  defaultOpen?: boolean;
  description?: string;
};

function Accordion({ children, label, icon: Icon, defaultOpen = false, description }: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-white/10 bg-[#151b32]/75 shadow-[0_20px_45px_rgba(5,9,20,0.35)]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-zinc-200"
      >
        <span className="flex flex-col gap-1">
          <span className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-[#6c7cff]" />
            {label}
          </span>
          {description && <span className="text-xs font-normal text-zinc-500">{description}</span>}
        </span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {open && <div className="border-t border-white/5 px-4 py-3 text-sm text-zinc-300">{children}</div>}
    </div>
  );
}

function ReasoningTrace({ part, isActive }: { part: ReasoningUIPart; isActive: boolean }) {
  const steps = part.data.steps;
  const statuses = steps.map((_, index) => {
    if (index < steps.length - 1) return "complete" as const;
    return isActive ? ("active" as const) : ("complete" as const);
  });

  return (
    <ChainOfThought defaultOpen>
      <ChainOfThoughtHeader>
        <span className="flex flex-col">
          <span className="font-medium text-foreground">Orchestrator thinking</span>
          <span className="text-xs text-muted-foreground">
            {part.data.headline ?? "Expand to inspect the orchestrator's thinking."}
          </span>
        </span>
      </ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        {steps.map((step, index) => {
          const label = step.title ?? step.detail ?? `Step ${index + 1}`;
          return (
            <ChainOfThoughtStep key={label} label={label} status={statuses[index]}>
              {step.detail && step.detail !== label && (
                <p className="text-sm leading-relaxed text-zinc-400">{step.detail}</p>
              )}
            </ChainOfThoughtStep>
          );
        })}
        {steps.length === 0 && (
          <ChainOfThoughtStep
            label="Capturing reasoning"
            status={isActive ? "active" : "pending"}
          />
        )}
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}

function ToolsAccordion({ parts }: { parts: ToolUIPart[] }) {
  return (
    <Accordion label="Tools" icon={CircleDashed} description="Delegations and tool calls from the workflow.">
      <div className="space-y-3">
        {parts.map((part, index) => (
          <div key={`${part.data.name}-${index}`} className="rounded-lg border border-white/10 bg-[#1a2138]/60 p-3">
            <div className="flex items-center justify-between">
              <span className="font-medium text-zinc-200">{part.data.name}</span>
              <span className="text-xs uppercase tracking-[0.25em] text-zinc-500">{part.data.status}</span>
            </div>
            {part.data.arguments !== undefined && part.data.arguments !== null && (
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-black/20 p-2 text-xs text-zinc-400">
                {JSON.stringify(part.data.arguments, null, 2)}
              </pre>
            )}
            {part.data.result !== undefined && part.data.result !== null && (
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-black/20 p-2 text-xs text-zinc-400">
                {JSON.stringify(part.data.result, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </Accordion>
  );
}

function SourcesAccordion({ part }: { part: SourcesUIPart }) {
  return (
    <Accordion label="Sources" icon={Clock} description="References verified during the run.">
      <div className="space-y-2">
        {part.data.map((source) => (
          <div key={source.id} className="rounded-lg border border-white/10 bg-[#1a2138]/60 p-3">
            <p className="font-medium text-zinc-200">{source.title}</p>
            {source.description && <p className="text-sm text-zinc-400">{source.description}</p>}
            {source.url && (
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-2 text-xs text-[#4e6bff] hover:text-[#6b82ff]"
              >
                View source
              </a>
            )}
          </div>
        ))}
      </div>
    </Accordion>
  );
}

function DeliverablesAccordion({
  parts,
  messageId,
}: {
  parts: EmailDraftUIPart[];
  messageId: string;
}) {
  return (
    <Accordion
      label="Deliverables"
      icon={Sparkles}
      description="Outputs generated by specialist agents."
    >
      <div className="space-y-3">
        {parts.map((part, index) => {
          const tone = part.data.metadata.tone;
          const toneLabel = typeof tone === "string" ? tone : "Draft";
          return (
            <div
              key={`${messageId}-deliverable-${index}`}
              className="rounded-lg border border-white/10 bg-[#1a2138]/60 p-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-zinc-200">{part.data.subject}</p>
                  <p className="text-xs text-zinc-400">{toneLabel}</p>
                </div>
              </div>
              <pre className="mt-3 whitespace-pre-wrap text-sm text-zinc-300">{part.data.body}</pre>
              {part.data.variants.length > 0 && (
                <div className="mt-3 space-y-2">
                  {part.data.variants.map((variant) => (
                    <div key={variant.label} className="rounded-md border border-white/10 bg-black/20 p-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">{variant.label}</p>
                      <pre className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">{variant.body}</pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Accordion>
  );
}
