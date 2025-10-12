"use client";

import { useChat } from "ai/react";
import { Loader2, Send } from "lucide-react";
import { FormEvent, KeyboardEvent, useMemo, useRef, useState } from "react";
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

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  parts?: Array<{
    type: "email-draft";
    deliverable: EmailDraftDeliverable;
  }>;
};

type CopyState = {
  label: string;
  recent: boolean;
};

const initialCopyState: CopyState = { label: "Copy", recent: false };

export function ChatPanel() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({ api: "/api/chat" });
  const typedMessages = messages as ChatMessage[];
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [copyState, setCopyState] = useState<Record<string, CopyState>>({});

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    handleSubmit(event);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
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

  const renderCopyButton = (id: string, content: string) => {
    const state = copyState[id] ?? initialCopyState;
    return (
      <button
        type="button"
        onClick={() => copyToClipboard(id, content)}
        className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 text-xs text-white/80 transition hover:border-white/40 hover:text-white"
      >
        {state.label}
      </button>
    );
  };

  const emptyState = useMemo(
    () => (
      <div className="rounded-xl border border-dashed border-white/10 bg-white/5 p-6 text-sm text-zinc-400">
        SideKick OS listens for your orchestration commands. Ask for email drafts, workflow updates, or policy changes through natural conversation.
      </div>
    ),
    [],
  );

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#161a2a]/80">
      <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-[#ef233c]">Command Center</p>
          <h1 className="text-lg font-semibold text-zinc-100">SideKick OS Orchestrator</h1>
        </div>
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-zinc-400" aria-hidden />}
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
        {typedMessages.length === 0 && emptyState}
        {typedMessages.map((message) => {
          const isUser = message.role === "user";
          const deliverableParts = message.parts?.filter((part) => part.type === "email-draft");

          return (
            <div key={message.id} className="space-y-3">
              <div
                className={cn(
                  "max-w-xl rounded-2xl px-4 py-3 text-sm",
                  isUser ? "ml-auto bg-[#ef233c] text-white" : "bg-[#101526] text-zinc-100",
                )}
              >
                <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
              </div>
              {!isUser && deliverableParts?.map((part, index) => {
                const deliverable = part.deliverable;
                return (
                  <div
                    key={`${message.id}-deliverable-${index}`}
                    className="max-w-2xl space-y-4 rounded-2xl border border-white/10 bg-[#101526] p-5 text-sm text-zinc-100"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.3em] text-[#ef233c]">Suggested subject</p>
                        <p className="text-base font-semibold text-white">{deliverable.subject}</p>
                      </div>
                      {renderCopyButton(`${message.id}-subject-${index}`, deliverable.subject)}
                    </div>
                    {deliverable.identicalToExisting && (
                      <p className="rounded-lg border border-zinc-500/40 bg-zinc-500/10 px-3 py-2 text-xs text-zinc-200">
                        Reused cached draft for this request.
                      </p>
                    )}
                    <div className="rounded-xl border border-white/10 bg-[#161a2a]/80 p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs uppercase tracking-[0.25em] text-zinc-400">Primary body</p>
                        {renderCopyButton(`${message.id}-primary-${index}`, deliverable.body)}
                      </div>
                      <pre className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-100">{deliverable.body}</pre>
                    </div>
                    {deliverable.variants?.length ? (
                      <div className="space-y-3">
                        <p className="text-xs uppercase tracking-[0.25em] text-zinc-400">Variants</p>
                        {deliverable.variants.map((variant, variantIndex) => (
                          <div key={variant.label} className="rounded-xl border border-white/5 bg-[#161a2a]/60 p-3">
                            <div className="mb-2 flex items-center justify-between">
                              <p className="text-sm font-medium text-white">{variant.label}</p>
                              {renderCopyButton(`${message.id}-variant-${index}-${variantIndex}`, variant.body)}
                            </div>
                            <pre className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">{variant.body}</pre>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <form onSubmit={onSubmit} className="border-t border-white/5 px-6 py-4">
        <div className="flex items-end gap-3 rounded-2xl border border-white/10 bg-[#101526] px-4 py-3">
          <textarea
            ref={textareaRef}
            value={input}
            onKeyDown={handleKeyDown}
            onChange={(event) => {
              handleInputChange(event);
              handleInput(event.currentTarget);
            }}
            placeholder="Ask the orchestrator..."
            className="h-10 w-full resize-none bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
            aria-label="Compose command"
            rows={1}
          />
          <button
            type="submit"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#ef233c] text-white transition hover:bg-[#d90429] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ef233c]"
            aria-label="Send command"
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </form>
    </div>
  );
}


