"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  Paperclip,
  Send,
  Sparkles,
  Workflow,
} from "lucide-react";
import {
  FormEvent,
  KeyboardEvent,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/utils/cn";

type EmailDraftVariant = {
  label: string;
  body: string;
};

type EmailDraftDeliverable = {
  subject: string;
  body: string;
  variants: EmailDraftVariant[];
  metadata: Record<string, unknown>;
  cacheKey: string;
  runId: string;
  identicalToExisting?: boolean;
};

type EmailDraftUIPart = {
  type: "data-email-draft";
  id?: string;
  data: EmailDraftDeliverable;
};

type TextPart = {
  type: "text";
  text: string;
  state?: "streaming" | "done";
};

type ReasoningStep = {
  title: string;
  detail: string;
};

type ReasoningUIPart = {
  type: "data-reasoning";
  id?: string;
  data: {
    headline?: string;
    steps: ReasoningStep[];
  };
};

type SourceItem = {
  id: string;
  title: string;
  description?: string;
  url?: string;
  badge?: string;
};

type SourcesUIPart = {
  type: "data-sources";
  id?: string;
  data: SourceItem[];
};

type ToolUIPart = {
  type: "data-tool";
  id?: string;
  data: {
    name: string;
    status: "started" | "completed" | "error";
    arguments?: unknown;
    result?: unknown;
  };
};

type MessagePart = TextPart | EmailDraftUIPart | ReasoningUIPart | SourcesUIPart | ToolUIPart;

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content?: string;
  parts?: MessagePart[];
};

type CopyState = {
  label: string;
  recent: boolean;
};

const initialCopyState: CopyState = { label: "Copy", recent: false };

type ThinkingStepState = {
  key: string;
  label: string;
  state: "complete" | "active" | "pending";
  meta?: string;
};

const findLatestAssistantMessage = (messages: ChatMessage[]): ChatMessage | undefined =>
  [...messages].reverse().find((message) => message.role === "assistant");

const extractTextContent = (message: ChatMessage | null | undefined): string => {
  if (!message) return "";
  if (message.content) return message.content;
  if (!Array.isArray(message.parts)) return "";

  return message.parts
    .filter((part): part is TextPart => part?.type === "text" && typeof (part as TextPart).text === "string")
    .map((part) => part.text)
    .join("");
};

export function ChatPanel() {
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });
  const typedMessages = messages as ChatMessage[];
  const [activeAssistantId, setActiveAssistantId] = useState<string | null>(null);
  const previousStatusRef = useRef(status);
  const previousAssistantIdRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [copyState, setCopyState] = useState<Record<string, CopyState>>({});
  const [input, setInput] = useState("");
  const isLoading = status !== "ready";

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;

    void sendMessage({ text: trimmed });
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      handleInput(textareaRef.current);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const form = event.currentTarget.closest("form");
      form?.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    }
  };

  const handleInput = (element: HTMLTextAreaElement) => {
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 180)}px`;
  };

  const copyToClipboard = async (id: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopyState((state) => ({
        ...state,
        [id]: { label: "Copied", recent: true },
      }));
      setTimeout(() => {
        setCopyState((state) => ({
          ...state,
          [id]: initialCopyState,
        }));
      }, 2000);
    } catch {
      setCopyState((state) => ({
        ...state,
        [id]: { label: "Copy failed", recent: true },
      }));
      setTimeout(() => {
        setCopyState((state) => ({
          ...state,
          [id]: initialCopyState,
        }));
      }, 2000);
    }
  };

  const renderCopyButton = (id: string, content: string, size: "sm" | "md" = "sm") => {
    const state = copyState[id] ?? initialCopyState;
    return (
      <button
        type="button"
        onClick={() => copyToClipboard(id, content)}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-white/10 text-white/80 transition hover:border-white/40 hover:text-white",
          size === "sm" ? "px-3 py-1 text-xs" : "px-4 py-1.5 text-sm",
        )}
      >
        {state.label}
      </button>
    );
  };

  useEffect(() => {
    if (previousStatusRef.current === "ready" && status !== "ready") {
      const latestAssistant = findLatestAssistantMessage(typedMessages);
      previousAssistantIdRef.current = latestAssistant?.id ?? null;
      setActiveAssistantId(null);
    }
    previousStatusRef.current = status;
  }, [status, typedMessages]);

  useEffect(() => {
    const latestAssistant = findLatestAssistantMessage(typedMessages);
    if (!latestAssistant) return;

    const previousAssistantId = previousAssistantIdRef.current;
    if (previousAssistantId === null || latestAssistant.id !== previousAssistantId) {
      previousAssistantIdRef.current = latestAssistant.id;
      setActiveAssistantId(latestAssistant.id);
      return;
    }

    if (status === "ready" && activeAssistantId == null) {
      setActiveAssistantId(latestAssistant.id);
    }
  }, [typedMessages, status, activeAssistantId]);

  const activeAssistantMessage = useMemo(
    () => (activeAssistantId ? typedMessages.find((message) => message.id === activeAssistantId) ?? null : null),
    [typedMessages, activeAssistantId],
  );

  const thinkingSteps = useMemo<ThinkingStepState[] | null>(() => {
    const inFlight = isLoading;
    const assistantMessage = activeAssistantMessage;

    if (!inFlight && !assistantMessage) {
      return null;
    }

    const toolParts = assistantMessage?.parts?.filter(
      (part): part is ToolUIPart => part?.type === "data-tool",
    ) ?? [];
    const deliverableParts = assistantMessage?.parts?.filter(
      (part): part is EmailDraftUIPart => part.type === "data-email-draft",
    ) ?? [];
    const hasResponseText = assistantMessage
      ? extractTextContent(assistantMessage).trim().length > 0
      : false;

    const stepsWithCompletion = [
      {
        key: "route",
        label: "Routing request",
        completed: Boolean(assistantMessage),
      },
      {
        key: "delegate",
        label: "Delegating specialists",
        completed: toolParts.length > 0 || (!inFlight && Boolean(assistantMessage)),
        meta: toolParts.length > 0 ? `${toolParts.length} tool${toolParts.length > 1 ? "s" : ""}` : undefined,
      },
      {
        key: "draft",
        label: "Drafting deliverable",
        completed: deliverableParts.length > 0 || (!inFlight && Boolean(assistantMessage)),
        meta:
          deliverableParts.length > 0
            ? `${deliverableParts.length} draft${deliverableParts.length > 1 ? "s" : ""}`
            : undefined,
      },
      {
        key: "finalize",
        label: "Publishing response",
        completed: !inFlight && (Boolean(assistantMessage) || hasResponseText),
      },
    ];

    const firstIncomplete = stepsWithCompletion.find((step) => !step.completed);

    return stepsWithCompletion.map((step) => {
      if (step.completed) {
        return { key: step.key, label: step.label, state: "complete" as const, meta: step.meta };
      }

      if (inFlight && (!assistantMessage || firstIncomplete?.key === step.key)) {
        return { key: step.key, label: step.label, state: "active" as const, meta: step.meta };
      }

      return { key: step.key, label: step.label, state: "pending" as const, meta: step.meta };
    });
  }, [activeAssistantMessage, isLoading]);

  const activeThinkingStep = thinkingSteps?.find((step) => step.state === "active");
  const headerStatusLabel = isLoading ? activeThinkingStep?.label ?? "Coordinating" : "Standing by";
  const showThinkingTicker = Boolean(thinkingSteps?.length);

  const emptyState = useMemo<ReactNode>(
    () => (
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#1f2440] to-[#101526] p-8 shadow-lg">
        <div className="absolute -top-16 -right-10 h-40 w-40 rounded-full bg-[#ef233c]/20 blur-3xl" aria-hidden />
        <div className="flex flex-col gap-3 text-zinc-200 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3 text-sm font-medium uppercase tracking-[0.35em] text-[#ef233c]">
            <Sparkles className="h-4 w-4" />
            SideKick Orchestrator
          </div>
          <span className="text-xs text-zinc-500">Ready for complex, multi-step requests</span>
        </div>
        <p className="mt-6 max-w-3xl text-base leading-relaxed text-zinc-100">
          Ask SideKick OS to coordinate workflows, draft executive-ready emails, or surface prior runs. The orchestrator streams reasoning, tools, and sources so you can trust every delegation.
        </p>
      </div>
    ),
    [],
  );

  return (
    <section className="flex h-full flex-1 flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#0f1321]/90 backdrop-blur-xl">
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-5">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.35em] text-[#ef233c]">Mission Control</span>
          <h1 className="text-xl font-semibold text-zinc-100">SideKick OS Orchestrator</h1>
          <p className="text-sm text-zinc-500">Agent routing • Draft generation • Activity telemetry</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <div className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-white/70">
            <Workflow className="h-4 w-4 text-[#ef233c]" />
            {headerStatusLabel}
          </div>
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-zinc-400" aria-hidden />}
        </div>
      </header>

      {showThinkingTicker && thinkingSteps && <ThinkingTicker steps={thinkingSteps} />}

      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
        {typedMessages.length === 0 && emptyState}

        {typedMessages.map((message) => {
          if (message.role === "system") return null;

          const isUser = message.role === "user";
          const textContent = extractTextContent(message);
          const reasoningPart = message.parts?.find(
            (part): part is ReasoningUIPart => part?.type === "data-reasoning",
          );
          const sourcesPart = message.parts?.find(
            (part): part is SourcesUIPart => part?.type === "data-sources",
          );
          const toolParts = message.parts?.filter(
            (part): part is ToolUIPart => part?.type === "data-tool",
          );
          const deliverableParts = message.parts?.filter(
            (part): part is EmailDraftUIPart => part.type === "data-email-draft",
          );

          return (
            <article
              key={message.id}
              className={cn("flex w-full flex-col gap-4", isUser ? "items-end" : "items-start")}
            >
              <div
                className={cn(
                  "max-w-3xl rounded-3xl px-5 py-4 text-sm leading-relaxed shadow-lg",
                  isUser
                    ? "bg-gradient-to-br from-[#ef233c] to-[#d90429] text-white"
                    : "bg-gradient-to-br from-[#171d33] via-[#14192b] to-[#101526] text-zinc-100",
                )}
              >
                <p className="whitespace-pre-wrap text-base">{textContent}</p>
              </div>

              {!isUser && (
                <div className="grid w-full max-w-4xl gap-4">
                  {reasoningPart && <ReasoningCard part={reasoningPart} />}
                  {toolParts?.length ? <ToolPanel parts={toolParts} /> : null}
                  {sourcesPart && <SourcesCard part={sourcesPart} />}
                  {deliverableParts?.map((part, index) => (
                    <EmailDraftCard
                      key={`${message.id}-deliverable-${index}`}
                      messageId={message.id}
                      index={index}
                      deliverable={part.data}
                      renderCopyButton={renderCopyButton}
                    />
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>

      <footer className="border-t border-white/10 px-6 py-5">
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Paperclip className="h-3.5 w-3.5" />
            Attachments coming soon • Drag files into the composer
          </div>
          <div className="flex items-end gap-3 rounded-3xl border border-white/10 bg-[#11172a]/90 px-5 py-4 shadow-inner">
            <textarea
              ref={textareaRef}
              value={input}
              onKeyDown={handleKeyDown}
              onChange={(event) => {
                setInput(event.currentTarget.value);
                handleInput(event.currentTarget);
              }}
              placeholder="Brief the orchestrator..."
              className="max-h-48 w-full resize-none bg-transparent text-base text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
              aria-label="Compose command"
              rows={1}
            />
            <button
              type="submit"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#ef233c] text-white transition hover:bg-[#d90429] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ef233c]"
              aria-label="Send command"
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </form>
      </footer>
    </section>
  );
}

type ThinkingTickerProps = {
  steps: ThinkingStepState[];
};

function ThinkingTicker({ steps }: ThinkingTickerProps) {
  if (!steps.length) return null;

  return (
    <div className="border-b border-white/10 px-6 py-3">
      <div className="flex items-center gap-2 overflow-x-auto text-xs">
        {steps.map((step) => {
          const palette =
            step.state === "complete"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
              : step.state === "active"
                ? "border-[#ef233c]/60 bg-[#ef233c]/10 text-white"
                : "border-white/10 bg-white/5 text-zinc-400";

          return (
            <div
              key={step.key}
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1.5 whitespace-nowrap transition",
                palette,
              )}
            >
              {step.state === "complete" ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : step.state === "active" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              <span className="text-xs font-medium tracking-wide">{step.label}</span>
              {step.meta && (
                <span className="text-[10px] uppercase tracking-[0.2em] text-white/60">{step.meta}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type ReasoningCardProps = {
  part: ReasoningUIPart;
};

function ReasoningCard({ part }: ReasoningCardProps) {
  const headline = part.data.headline ?? "Reasoning";
  const steps = Array.isArray(part.data.steps) ? part.data.steps : [];
  const [isOpen, setIsOpen] = useState(false);

  if (steps.length === 0) return null;

  const containerClass = cn(
    "rounded-3xl border border-white/10 bg-gradient-to-br from-[#151a31] via-[#13172a] to-[#101422] text-sm text-zinc-100 shadow-lg transition-all duration-300",
    isOpen ? "p-6" : "p-4",
  );

  return (
    <section className={containerClass}>
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className="flex w-full items-center justify-between gap-2 text-left text-xs font-semibold uppercase tracking-[0.3em] text-[#ef233c]"
      >
        <span className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          {headline}
        </span>
        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>

      {!isOpen && (
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-zinc-400">
          {steps.slice(0, 2).map((step, index) => (
            <span
              key={`${part.id ?? "reason"}-summary-${index}`}
              className="max-w-[220px] truncate rounded-full border border-white/15 bg-white/5 px-3 py-1 font-medium text-zinc-300"
              title={step.title}
            >
              {index + 1}. {step.title}
            </span>
          ))}
          {steps.length > 2 && (
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-zinc-500">
              +{steps.length - 2} more
            </span>
          )}
        </div>
      )}

      {isOpen && (
        <ol className="mt-5 space-y-3 text-sm">
          {steps.map((step, index) => (
            <li key={`${part.id ?? "reason"}-${index}`} className="flex items-start gap-3 rounded-2xl bg-white/5 p-4">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#ef233c]/20 text-xs font-semibold text-[#ef233c]">
                {index + 1}
              </span>
              <div>
                <p className="text-sm font-medium text-zinc-100">{step.title}</p>
                <p className="mt-1 text-sm text-zinc-400">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

type ToolPanelProps = {
  parts: ToolUIPart[];
};

function ToolPanel({ parts }: ToolPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  const containerClass = cn(
    "rounded-3xl border border-white/10 bg-gradient-to-br from-[#141b2c] via-[#121726] to-[#0f1420] shadow-lg transition-all duration-300",
    isOpen ? "p-6" : "p-4",
  );

  const summarizeStatus = (status: ToolUIPart["data"]["status"]) => {
    if (status === "completed") return "Completed";
    if (status === "error") return "Error";
    return "Running";
  };

  return (
    <section className={containerClass}>
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className="mb-2 flex w-full items-center justify-between gap-2 text-left text-sm text-zinc-400"
      >
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-[#ef233c]">
          <Workflow className="h-4 w-4" /> Tool activity
        </span>
        <span className="flex items-center gap-2 text-xs text-zinc-500">
          {parts.length} tool{parts.length === 1 ? "" : "s"}
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
      </button>
      {!isOpen && parts.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          {parts.slice(0, 3).map((part, index) => {
            const { name, status } = part.data;
            const palette =
              status === "completed"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                : status === "error"
                  ? "border-red-500/40 bg-red-500/10 text-red-200"
                  : "border-blue-500/30 bg-blue-500/10 text-blue-200";

            return (
              <span
                key={part.id ?? `${name}-summary-${index}`}
                className={cn(
                  "max-w-[220px] truncate rounded-full border px-3 py-1 text-[11px] font-medium",
                  palette,
                )}
                title={`${name} • ${summarizeStatus(status)}`}
              >
                {name} • {summarizeStatus(status)}
              </span>
            );
          })}
          {parts.length > 3 && (
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-zinc-500">
              +{parts.length - 3} more
            </span>
          )}
        </div>
      )}
      {isOpen && (
        <div className="mt-4 space-y-4">
          {parts.map((part, index) => {
            const { name, status, arguments: args, result } = part.data;
            const normalizedArguments = normalizeObject(args);
            const normalizedResult = normalizeObject(result);
            const isError = status === "error";

            return (
              <div
                key={part.id ?? `${name}-${index}`}
                className="rounded-2xl border border-white/5 bg-white/5 p-4 text-sm text-zinc-100"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-zinc-100">{name}</p>
                    <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">SideKick toolchain</p>
                  </div>
                  <StatusPill status={status} />
                </div>
                {normalizedArguments && (
                  <div className="mt-4 space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">Arguments</span>
                    <pre className="w-full overflow-x-auto rounded-2xl bg-black/30 p-3 text-xs text-zinc-200 whitespace-pre-wrap break-words">
                      {normalizedArguments}
                    </pre>
                  </div>
                )}
                {normalizedResult && (
                  <div className="mt-4 space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">Result</span>
                    <pre className="w-full overflow-x-auto rounded-2xl bg-black/30 p-3 text-xs text-zinc-200 whitespace-pre-wrap break-words">
                      {normalizedResult}
                    </pre>
                  </div>
                )}
                {isError && (
                  <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Tool reported an error.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

type SourcesCardProps = {
  part: SourcesUIPart;
};

function SourcesCard({ part }: SourcesCardProps) {
  const sources = Array.isArray(part.data) ? part.data : [];
  const [isOpen, setIsOpen] = useState(false);
  if (sources.length === 0) return null;

  const containerClass = cn(
    "rounded-3xl border border-white/10 bg-gradient-to-br from-[#181f36] via-[#151b2f] to-[#111628] shadow-lg transition-all duration-300",
    isOpen ? "p-6" : "p-4",
  );

  return (
    <section className={containerClass}>
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className="flex w-full items-center justify-between gap-2 text-left text-xs font-semibold uppercase tracking-[0.3em] text-[#ef233c]"
      >
        <span className="flex items-center gap-2">
          <FileText className="h-4 w-4" /> Sources & provenance
        </span>
        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>

      {!isOpen && (
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-zinc-400">
          {sources.slice(0, 2).map((source) => (
            <span
              key={`${source.id}-summary`}
              className="max-w-[220px] truncate rounded-full border border-white/15 bg-white/5 px-3 py-1 font-medium text-zinc-300"
              title={source.title}
            >
              {source.title}
            </span>
          ))}
          {sources.length > 2 && (
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-zinc-500">
              +{sources.length - 2} more
            </span>
          )}
        </div>
      )}

      {isOpen && (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {sources.map((source) => (
            <a
              key={source.id}
              href={source.url ?? "#"}
              target={source.url ? "_blank" : undefined}
              rel={source.url ? "noreferrer" : undefined}
              className="group relative overflow-hidden rounded-2xl border border-white/5 bg-white/5 p-4 transition hover:border-white/20"
            >
              <div className="absolute -right-10 top-6 h-20 w-20 rounded-full bg-[#ef233c]/10 blur-3xl transition group-hover:translate-x-4" aria-hidden />
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-zinc-100">{source.title}</p>
                {source.url && <ExternalLink className="h-4 w-4 text-zinc-400" />}
              </div>
              {source.description && <p className="mt-2 text-xs text-zinc-400">{source.description}</p>}
              {source.badge && (
                <span className="mt-3 inline-flex items-center rounded-full border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.25em] text-white/70">
                  {source.badge}
                </span>
              )}
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

type EmailDraftCardProps = {
  messageId: string;
  index: number;
  deliverable: EmailDraftDeliverable;
  renderCopyButton: (id: string, content: string, size?: "sm" | "md") => ReactNode;
};

function EmailDraftCard({ messageId, index, deliverable, renderCopyButton }: EmailDraftCardProps) {
  const variants = Array.isArray(deliverable.variants) ? deliverable.variants : [];
  const metadata = (deliverable.metadata ?? {}) as Record<string, unknown>;
  const keyPoints = Array.isArray(metadata.keyPoints) ? (metadata.keyPoints as string[]) : [];
  const recipient = typeof metadata.recipient === "string" ? metadata.recipient : undefined;
  const tone = typeof metadata.tone === "string" ? metadata.tone : undefined;
  const additionalContext = typeof metadata.additionalContext === "string" ? metadata.additionalContext : undefined;

  return (
    <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#151b2f] via-[#141a2c] to-[#101522] p-6 text-sm text-zinc-100 shadow-lg">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-[#ef233c]">
            <CheckCircle2 className="h-4 w-4" /> Email deliverable
          </span>
          <h2 className="text-lg font-semibold text-white">{deliverable.subject}</h2>
          <p className="text-xs text-zinc-500">Run {deliverable.runId} • Cache key {deliverable.cacheKey.slice(0, 10)}</p>
        </div>
        <div>{renderCopyButton(`${messageId}-subject-${index}`, deliverable.subject, "md")}</div>
      </div>

      {deliverable.identicalToExisting && (
        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          <CheckCircle2 className="h-3.5 w-3.5" /> Served from cache for this intent.
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-white/10 bg-[#0e1320]/80 p-4">
            <header className="mb-2 flex items-center justify-between">
              <span className="text-xs uppercase tracking-[0.25em] text-zinc-500">Primary draft</span>
              {renderCopyButton(`${messageId}-primary-${index}`, deliverable.body)}
            </header>
            <pre className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-100">{deliverable.body}</pre>
          </section>

          {variants.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-xs uppercase tracking-[0.25em] text-zinc-500">Variants ({variants.length})</h3>
              {variants.map((variant, variantIndex) => (
                <article
                  key={variant.label}
                  className="rounded-2xl border border-white/10 bg-[#0f1524]/70 p-4"
                >
                  <header className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-white">{variant.label}</span>
                    {renderCopyButton(
                      `${messageId}-variant-${index}-${variantIndex}`,
                      variant.body,
                    )}
                  </header>
                  <pre className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">{variant.body}</pre>
                </article>
              ))}
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-white/10 bg-[#0d121f]/80 p-4">
            <h4 className="text-xs uppercase tracking-[0.25em] text-zinc-500">Context summary</h4>
            <dl className="mt-3 space-y-2 text-sm text-zinc-300">
              {recipient && (
                <div className="flex justify-between gap-2">
                  <dt className="text-zinc-500">Recipient</dt>
                  <dd className="text-right text-zinc-200">{recipient}</dd>
                </div>
              )}
              {tone && (
                <div className="flex justify-between gap-2">
                  <dt className="text-zinc-500">Tone</dt>
                  <dd className="text-right text-zinc-200">{tone}</dd>
                </div>
              )}
              {additionalContext && (
                <div className="flex flex-col gap-1">
                  <dt className="text-zinc-500">Additional notes</dt>
                  <dd className="rounded-xl border border-white/5 bg-white/5 p-3 text-xs text-zinc-300">
                    {additionalContext}
                  </dd>
                </div>
              )}
            </dl>
          </section>

          {keyPoints.length > 0 && (
            <section className="rounded-2xl border border-white/10 bg-[#0d131f]/80 p-4">
              <h4 className="text-xs uppercase tracking-[0.25em] text-zinc-500">Key points</h4>
              <ul className="mt-3 space-y-2 text-sm text-zinc-300">
                {keyPoints.map((point, pointIndex) => (
                  <li
                    key={`${deliverable.cacheKey}-point-${pointIndex}`}
                    className="rounded-xl border border-white/5 bg-white/5 px-3 py-2 text-xs text-zinc-200"
                  >
                    {point}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </section>
  );
}

type StatusPillProps = {
  status: "started" | "completed" | "error";
};

function StatusPill({ status }: StatusPillProps) {
  const labelMap: Record<StatusPillProps["status"], string> = {
    started: "Started",
    completed: "Completed",
    error: "Error",
  };

  const palette: Record<StatusPillProps["status"], string> = {
    started: "bg-blue-500/10 text-blue-200 border-blue-500/20",
    completed: "bg-emerald-500/10 text-emerald-200 border-emerald-500/20",
    error: "bg-red-500/10 text-red-200 border-red-500/20",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs uppercase tracking-[0.25em]",
        palette[status],
      )}
    >
      {status === "completed" ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
      {status === "error" ? <AlertTriangle className="h-3.5 w-3.5" /> : null}
      {labelMap[status]}
    </span>
  );
}

const normalizeObject = (value: unknown): string | null => {
  if (value == null) return null;

  const parsed = typeof value === "string" ? tryParse(value) : value;
  if (typeof parsed === "string") return parsed;

  try {
    return JSON.stringify(parsed, null, 2);
  } catch {
    return String(parsed);
  }
};

const tryParse = (value: string) => {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};


