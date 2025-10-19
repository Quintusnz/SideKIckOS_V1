"use client";

import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type ChatStatus } from "ai";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageAvatar,
  MessageContent,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputFooter,
  PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import {
  Sources,
  SourcesContent,
  SourcesTrigger,
  Source,
} from "@/components/ai-elements/sources";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { Response } from "@/components/ai-elements/response";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckIcon, CopyIcon, Sparkles } from "lucide-react";
import type {
  ChatMessage,
  EmailDraftUIPart,
  ResearchBriefUIPart,
  ResearchPlanUIPart,
  ReasoningUIPart,
  SourcesUIPart,
  TextPart,
  ToolUIPart as OrchestratorToolPart,
} from "@/types/chat";

type ToolState = "input-streaming" | "input-available" | "output-available" | "output-error";

type NonSystemMessage = ChatMessage & { role: "user" | "assistant" };

type ToolStateMap = Record<OrchestratorToolPart["data"]["status"], ToolState>;

const TOOL_STATE_MAP: ToolStateMap = {
  started: "input-available",
  completed: "output-available",
  error: "output-error",
};

export function ChatPanel() {
  const { messages, sendMessage, status, stop } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  const displayedMessages = useMemo(
    () => (messages as ChatMessage[]).filter((message): message is NonSystemMessage => message.role !== "system"),
    [messages],
  );

  const lastAssistantId = useMemo(() => {
    for (let index = displayedMessages.length - 1; index >= 0; index -= 1) {
      const message = displayedMessages[index];
      if (message.role === "assistant") {
        return message.id;
      }
    }
    return null;
  }, [displayedMessages]);

  const statusLabel = getStatusLabel(status);

  const handleSubmit = useCallback(
    async ({ text }: PromptInputMessage) => {
      if (status === "streaming") {
        stop();
        return;
      }

      const value = text?.trim();
      if (!value) {
        return;
      }

      await sendMessage({ text: value });
    },
    [sendMessage, status, stop],
  );

  const hasMessages = displayedMessages.length > 0;

  return (
    <section className="flex h-full flex-1 flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0c1224]/95">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-2.5 text-[11px] uppercase tracking-[0.3em] text-zinc-400">
        <span>Conversation workbench</span>
        <Badge variant="outline" className="border-primary/40 bg-primary/10 px-2 text-[10px] font-semibold tracking-[0.25em] text-primary">
          {statusLabel}
        </Badge>
      </header>

      <Conversation className="flex-1">
        <ConversationContent className="mx-auto flex w-full max-w-3xl flex-col gap-4 py-6">
          {!hasMessages ? (
            <ConversationEmptyState
              className="rounded-xl border border-dashed border-white/15 bg-white/[0.04] px-6 py-10 text-sm"
              icon={<Sparkles className="size-6 text-primary" aria-hidden="true" />}
              title="Start a chat with the orchestrator"
              description="Ask for an executive email draft, hand off a workflow, or inspect the latest run."
            />
          ) : (
            displayedMessages.map((message) => {
              const text = extractText(message);
              const reasoningPart = getReasoningPart(message);
              const toolParts = getToolParts(message);
              const sourcesPart = getSourcesPart(message);
              const emailParts = getEmailParts(message);
              const planParts = getResearchPlanParts(message);
              const researchParts = getResearchParts(message);
              const isStreaming = status !== "ready" && message.id === lastAssistantId;

              const isAssistant = message.role === "assistant";
              const showExtras =
                isAssistant && (toolParts.length > 0 || sourcesPart || emailParts.length > 0 || planParts.length > 0 || researchParts.length > 0);

              return (
                <Message key={message.id} from={message.role}>
                  <MessageAvatar
                    name={isAssistant ? "SK" : "You"}
                    className={
                      isAssistant
                        ? "bg-[#4e6bff] text-white ring-2 ring-[#4e6bff]/40"
                        : "bg-white text-[#0b1224] ring-2 ring-white/80"
                    }
                  />
                  <div className="flex flex-1 flex-col gap-2">
                    {isAssistant && reasoningPart ? (
                      <ReasoningBlock part={reasoningPart} isStreaming={isStreaming} />
                    ) : null}

                    {text && (
                      <MessageContent
                        variant={isAssistant ? "flat" : "contained"}
                        className={cn(
                          "text-sm",
                          isAssistant
                            ? "group-[.is-assistant]:rounded-lg group-[.is-assistant]:border group-[.is-assistant]:border-white/10 group-[.is-assistant]:bg-white/8 group-[.is-assistant]:px-4 group-[.is-assistant]:py-3 group-[.is-assistant]:text-zinc-100"
                            : "group-[.is-user]:bg-primary/90 group-[.is-user]:text-white"
                        )}
                      >
                        <Response>{text}</Response>
                      </MessageContent>
                    )}

                    {showExtras ? (
                      <div className="space-y-3">
                        {toolParts.map((part) => (
                          <ToolTelemetry key={part.id ?? `${message.id}-tool-${part.data.name}`} part={part} />
                        ))}

                        {sourcesPart ? <SourcesBlock part={sourcesPart} /> : null}

                        {emailParts.map((part, index) => (
                          <EmailDraftCard key={part.id ?? `${message.id}-email-${index}`} part={part} index={index} />
                        ))}

                        {planParts.map((part, index) => (
                          <ResearchPlanCard key={part.id ?? `${message.id}-plan-${index}`} part={part} />
                        ))}

                        {researchParts.map((part, index) => (
                          <ResearchBriefCard key={part.id ?? `${message.id}-research-${index}`} part={part} />
                        ))}
                      </div>
                    ) : null}
                  </div>
                </Message>
              );
            })
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <footer className="border-t border-white/10 bg-[#0b1224]/90 px-4 py-5">
        <PromptInput
          accept="image/*"
          className="mx-auto w-full max-w-3xl"
          maxFiles={6}
          onSubmit={handleSubmit}
        >
          <PromptInputAttachments>
            {(file) => <PromptInputAttachment data={file} />}
          </PromptInputAttachments>
          <PromptInputBody>
            <PromptInputTextarea
              aria-label="Compose message"
              placeholder="Brief the orchestrator..."
              disabled={status === "submitted"}
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              <PromptInputActionMenu>
                <PromptInputActionMenuTrigger aria-label="Open composer actions" />
                <PromptInputActionMenuContent>
                  <PromptInputActionAddAttachments />
                </PromptInputActionMenuContent>
              </PromptInputActionMenu>
            </PromptInputTools>
            <PromptInputSubmit status={status} />
          </PromptInputFooter>
        </PromptInput>
      </footer>
    </section>
  );
}

function extractText(message: ChatMessage): string {
  if (typeof message.content === "string" && message.content.trim()) {
    return message.content;
  }

  if (!Array.isArray(message.parts)) {
    return "";
  }

  return message.parts
    .filter((part): part is TextPart => part?.type === "text" && typeof (part as TextPart).text === "string")
    .map((part) => part.text)
    .join("");
}

function getReasoningPart(message: ChatMessage): ReasoningUIPart | undefined {
  return message.parts?.find((part): part is ReasoningUIPart => part?.type === "data-reasoning");
}

function getToolParts(message: ChatMessage): OrchestratorToolPart[] {
  if (!Array.isArray(message.parts)) {
    return [];
  }

  return message.parts.filter((part): part is OrchestratorToolPart => part?.type === "data-tool");
}

function getSourcesPart(message: ChatMessage): SourcesUIPart | undefined {
  return message.parts?.find((part): part is SourcesUIPart => part?.type === "data-sources");
}

function getEmailParts(message: ChatMessage): EmailDraftUIPart[] {
  if (!Array.isArray(message.parts)) {
    return [];
  }

  return message.parts.filter((part): part is EmailDraftUIPart => part?.type === "data-email-draft");
}

function getResearchPlanParts(message: ChatMessage): ResearchPlanUIPart[] {
  if (!Array.isArray(message.parts)) {
    return [];
  }

  return message.parts.filter((part): part is ResearchPlanUIPart => part?.type === "data-research-plan");
}

function getResearchParts(message: ChatMessage): ResearchBriefUIPart[] {
  if (!Array.isArray(message.parts)) {
    return [];
  }

  return message.parts.filter((part): part is ResearchBriefUIPart => part?.type === "data-research-brief");
}

function ReasoningBlock({ part, isStreaming }: { part: ReasoningUIPart; isStreaming: boolean }) {
  const steps = part.data.steps ?? [];
  const activeIndex = steps.length > 0 ? steps.length - 1 : -1;
  const activeTitle = steps[activeIndex]?.title?.trim() || part.data.headline?.trim() || "Agent";
  const status = part.data.status ?? (isStreaming ? "in-progress" : "completed");

  const formattedSteps = steps.map((step, index) => {
    const title = step.title?.trim() || `Step ${index + 1}`;
    const detail = step.detail?.trim();
    const description = detail && detail !== title ? `${title} — ${detail}` : title;
    const status = index === activeIndex ? (isStreaming ? "⏳" : "✅") : "✅";
    return `${status} ${description}`;
  });

  if (formattedSteps.length === 0) {
    formattedSteps.push(isStreaming ? "⏳ Routing tasks…" : "✅ Ready for next request.");
  }

  return (
    <Reasoning defaultOpen={false} isStreaming={isStreaming}>
      <ReasoningTrigger>
        {status === "in-progress" ? `Active • ${activeTitle}` : `Completed • ${activeTitle}`}
      </ReasoningTrigger>
      <ReasoningContent>{formattedSteps.join("\n")}</ReasoningContent>
    </Reasoning>
  );
}

function ToolTelemetry({ part }: { part: OrchestratorToolPart }) {
  const state = TOOL_STATE_MAP[part.data.status] ?? "input-streaming";
  const title = formatToolName(part.data.name);

  return (
    <Tool defaultOpen={state !== "input-streaming"}>
      <ToolHeader state={state} title={title} type={`tool-${part.data.name ?? "tool"}`} />
      <ToolContent>
        {part.data.arguments !== undefined ? <ToolInput input={part.data.arguments} /> : null}
        <ToolOutput
          errorText={state === "output-error" ? "Tool execution failed." : undefined}
          output={part.data.result}
        />
      </ToolContent>
    </Tool>
  );
}

function SourcesBlock({ part }: { part: SourcesUIPart }) {
  const count = part.data.length;
  if (count === 0) {
    return null;
  }

  return (
    <Sources>
      <SourcesTrigger count={count} />
      <SourcesContent>
        {part.data.map((source) => {
          const body = (
            <div className="flex flex-col text-sm">
              <span className="font-medium">{source.title}</span>
              {source.description ? (
                <span className="text-xs text-muted-foreground">{source.description}</span>
              ) : null}
              {source.badge ? (
                <span className="text-xs uppercase tracking-wide text-primary/80">{source.badge}</span>
              ) : null}
            </div>
          );

          if (source.url) {
            return (
              <Source key={source.id} href={source.url} title={source.title}>
                {body}
              </Source>
            );
          }

          return (
            <div key={source.id} className="flex items-center gap-2">
              {body}
            </div>
          );
        })}
      </SourcesContent>
    </Sources>
  );
}

function EmailDraftCard({ part, index }: { part: EmailDraftUIPart; index: number }) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const resetAfterDelay = useCallback((key: string) => {
    window.setTimeout(() => {
      setCopiedKey((current) => (current === key ? null : current));
    }, 1600);
  }, []);

  const copy = useCallback(async (key: string, text: string) => {
    if (!text) return;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        setCopiedKey(key);
        resetAfterDelay(key);
      }
    } catch (error) {
      console.error("Failed to copy draft", error);
    }
  }, [resetAfterDelay]);

  const { subject, body, variants = [], runId, identicalToExisting } = part.data;
  const primaryKey = `primary-${index}`;

  return (
    <Card className="border-muted">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>{subject || `Email draft ${index + 1}`}</CardTitle>
            <CardDescription>Generated by the email specialist.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {runId ? <Badge variant="secondary">Run {runId}</Badge> : null}
            {identicalToExisting ? <Badge variant="outline">From cache</Badge> : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 text-sm">
        <DraftSection
          heading="Subject"
          copyLabel="Copy subject"
          isCopied={copiedKey === `${primaryKey}-subject`}
          onCopy={() => copy(`${primaryKey}-subject`, subject ?? "")}
        >
          <span className="font-medium">{subject ?? "No subject provided."}</span>
        </DraftSection>

        <DraftSection
          heading="Body"
          copyLabel="Copy body"
          isCopied={copiedKey === `${primaryKey}-body`}
          onCopy={() => copy(`${primaryKey}-body`, body)}
        >
          <Response className="prose dark:prose-invert max-w-none text-sm">{body}</Response>
        </DraftSection>

        {variants.length > 0 ? (
          <div className="space-y-4">
            {variants.map((variant, variantIndex) => {
              const key = `${primaryKey}-variant-${variantIndex}`;
              return (
                <DraftSection
                  key={key}
                  heading={variant.label || `Variant ${variantIndex + 1}`}
                  copyLabel="Copy variant"
                  isCopied={copiedKey === key}
                  onCopy={() => copy(key, variant.body)}
                >
                  <Response className="prose dark:prose-invert max-w-none text-sm">{variant.body}</Response>
                </DraftSection>
              );
            })}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ResearchBriefCard({ part }: { part: ResearchBriefUIPart }) {
  const { topic, summary, keyFindings, recommendations, followUps, runId, identicalToExisting } = part.data;

  const formatConfidence = (
    value?: ResearchBriefUIPart["data"]["keyFindings"][number]["confidence"],
  ) => {
    if (!value) return undefined;
    if (value === "high") return "High confidence";
    if (value === "medium") return "Medium confidence";
    if (value === "low") return "Working theory";
    return value;
  };

  return (
    <Card className="border-primary/40 bg-white/[0.04]">
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-1 flex-col gap-1">
            <CardTitle className="text-base font-semibold text-zinc-100">{topic}</CardTitle>
            <CardDescription className="text-sm text-muted-foreground">{summary}</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {identicalToExisting ? (
              <Badge variant="outline" className="border-primary/40 text-[10px] uppercase tracking-wide text-primary">
                Cached brief
              </Badge>
            ) : null}
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
              Run {runId}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-zinc-100">
        {keyFindings.length > 0 ? (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-primary/80">Key findings</h4>
            <ul className="space-y-2">
              {keyFindings.map((finding, index) => (
                <li key={`${finding.title}-${index}`} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-zinc-100">{finding.title}</span>
                    {formatConfidence(finding.confidence) ? (
                      <Badge variant="outline" className="border-white/20 text-[10px] uppercase tracking-wide">
                        {formatConfidence(finding.confidence)}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-zinc-300">{finding.insight}</p>
                  {finding.citations.length > 0 ? (
                    <p className="mt-2 text-xs uppercase tracking-wide text-primary/70">
                      Cites: {finding.citations.join(", ")}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {recommendations.length > 0 ? (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-primary/80">Recommended actions</h4>
            <ul className="space-y-2">
              {recommendations.map((recommendation, index) => (
                <li key={`${recommendation.action}-${index}`} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-zinc-100">{recommendation.action}</span>
                    {recommendation.priority ? (
                      <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                        {recommendation.priority}
                      </Badge>
                    ) : null}
                  </div>
                  {recommendation.rationale ? (
                    <p className="mt-1 text-sm text-zinc-300">{recommendation.rationale}</p>
                  ) : null}
                  {recommendation.citations.length > 0 ? (
                    <p className="mt-2 text-xs uppercase tracking-wide text-primary/70">
                      Cites: {recommendation.citations.join(", ")}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {followUps.length > 0 ? (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-primary/80">Follow-ups</h4>
            <ul className="list-disc space-y-1 pl-4 text-sm text-zinc-300">
              {followUps.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ResearchPlanCard({ part }: { part: ResearchPlanUIPart }) {
  const { objective, constraints, tasks, budgets, recencyWindow, openQuestions, deliverableExpectation, runId } = part.data;

  return (
    <Card className="border-blue-500/40 bg-blue-500/[0.08]">
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base font-semibold text-zinc-100">Research plan</CardTitle>
            <CardDescription className="text-sm text-zinc-300">Structured scope prepared before investigation.</CardDescription>
          </div>
          <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
            Run {runId}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-zinc-100">
        <section className="space-y-1">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-primary/80">Objective</h4>
          <p className="text-sm text-zinc-200">{objective}</p>
        </section>

        {constraints.length > 0 ? (
          <section className="space-y-1">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-primary/80">Constraints</h4>
            <ul className="list-disc space-y-1 pl-4 text-sm text-zinc-300">
              {constraints.map((constraint, index) => (
                <li key={`${constraint}-${index}`}>{constraint}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="space-y-1">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-primary/80">Tasks</h4>
          <ul className="space-y-2">
            {tasks.map((task) => (
              <li key={task.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-zinc-100">{task.title}</span>
                  {task.modality ? (
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                      {task.modality}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-zinc-300">{task.detail}</p>
                {task.successCriteria ? (
                  <p className="mt-2 text-xs uppercase tracking-wide text-primary/70">
                    Success: {task.successCriteria}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-primary/80">Budgets & guardrails</h4>
          <dl className="grid gap-2 text-xs text-zinc-300 sm:grid-cols-2">
            {(
              [
                { label: "Web searches", value: budgets.webSearches },
                { label: "File searches", value: budgets.fileSearches },
                { label: "Follow-up loops", value: budgets.followUpIterations },
                { label: "Timebox (min)", value: budgets.timeboxMinutes },
              ] as const
            ).map((entry) => (
              <div key={entry.label} className="flex items-center justify-between rounded border border-white/5 bg-white/[0.02] px-3 py-2">
                <span className="font-medium uppercase tracking-wide text-xs text-zinc-400">{entry.label}</span>
                <span className="text-sm text-zinc-100">{entry.value ?? "—"}</span>
              </div>
            ))}
            {budgets.notes ? (
              <div className="sm:col-span-2 rounded border border-white/5 bg-white/[0.02] px-3 py-2">
                <span className="block text-xs font-medium uppercase tracking-wide text-zinc-400">Notes</span>
                <p className="text-sm text-zinc-200">{budgets.notes}</p>
              </div>
            ) : null}
          </dl>
          {recencyWindow ? (
            <p className="text-xs uppercase tracking-wide text-primary/70">Recency window: {recencyWindow}</p>
          ) : null}
          {deliverableExpectation ? (
            <p className="text-xs uppercase tracking-wide text-primary/70">Deliverable: {deliverableExpectation}</p>
          ) : null}
        </section>

        {openQuestions.length > 0 ? (
          <section className="space-y-1">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-primary/80">Open questions</h4>
            <ul className="list-disc space-y-1 pl-4 text-sm text-zinc-300">
              {openQuestions.map((question, index) => (
                <li key={`${question}-${index}`}>{question}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DraftSection({
  heading,
  children,
  onCopy,
  isCopied,
  copyLabel,
}: {
  heading: string;
  children: ReactNode;
  onCopy: () => void;
  isCopied: boolean;
  copyLabel: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{heading}</h3>
        <Button
          aria-label={copyLabel}
          onClick={onCopy}
          size="sm"
          type="button"
          variant="ghost"
        >
          {isCopied ? (
            <>
              <CheckIcon className="mr-2 size-4" /> Copied
            </>
          ) : (
            <>
              <CopyIcon className="mr-2 size-4" /> Copy
            </>
          )}
        </Button>
      </div>
      <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
        {children}
      </div>
    </div>
  );
}

function getStatusLabel(status: ChatStatus): string {
  switch (status) {
    case "submitted":
      return "Preparing response";
    case "streaming":
      return "Streaming response";
    case "error":
      return "Something went wrong";
    default:
      return "Standing by";
  }
}

function formatToolName(name: string | undefined): string {
  if (!name) return "Tool";
  return name
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
