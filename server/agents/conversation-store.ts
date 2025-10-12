import type { AgentInputItem } from "@openai/agents";
import { createRuntimeContext, type EmailAgentRuntimeContext } from "@/server/agents/runtime";
import { randomUUID } from "crypto";

type SessionState = {
  context: EmailAgentRuntimeContext;
  history: AgentInputItem[];
};

const sessions = new Map<string, SessionState>();

export const getOrCreateSession = (threadId?: string) => {
  const id = threadId ?? randomUUID();
  const existing = sessions.get(id);
  if (existing) {
    return { id, session: existing };
  }

  const context = createRuntimeContext({ threadId: id });
  const session: SessionState = { context, history: [] };
  sessions.set(id, session);
  return { id, session };
};

export const updateSessionHistory = (threadId: string, items: AgentInputItem[]) => {
  const entry = sessions.get(threadId);
  if (!entry) return;
  entry.history = items;
};

export const resetSessions = () => sessions.clear();
