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
    status?: "in-progress" | "completed";
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

export type ResearchPlanUIPart = {
  type: "data-research-plan";
  id?: string;
  data: {
    objective: string;
    constraints: string[];
    tasks: Array<{
      id: string;
      title: string;
      detail: string;
      modality: "web" | "corpus" | "analysis" | "validation" | "other" | null;
      successCriteria: string | null;
    }>;
    budgets: {
      webSearches: number | null;
      fileSearches: number | null;
      followUpIterations: number | null;
      timeboxMinutes: number | null;
      notes: string | null;
    };
    recencyWindow: string | null;
    openQuestions: string[];
    deliverableExpectation: string | null;
    metadata: Record<string, unknown>;
    runId: string;
  };
};

export type ResearchBriefUIPart = {
  type: "data-research-brief";
  id?: string;
  data: {
    topic: string;
    summary: string;
    keyFindings: Array<{
      title: string;
      insight: string;
      confidence?: "low" | "medium" | "high" | null;
      citations: string[];
    }>;
    recommendations: Array<{
      action: string;
      rationale?: string | null;
      priority?: "immediate" | "near-term" | "watch" | null;
      citations: string[];
    }>;
    followUps: string[];
    sources: Array<{
      id: string;
      title: string;
      description?: string | null;
      url?: string | null;
      badge?: string | null;
      publishedAt?: string | null;
    }>;
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
  | EmailDraftUIPart
  | ResearchPlanUIPart
  | ResearchBriefUIPart;

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content?: string;
  parts?: MessagePart[];
};
