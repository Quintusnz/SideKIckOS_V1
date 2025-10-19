import { z } from "zod";

type JsonSchemaDefinitionEntry = Record<string, any>;
type JsonObjectSchema<Properties extends Record<string, JsonSchemaDefinitionEntry>> = {
  type: "object";
  properties: Properties;
  required: ReadonlyArray<keyof Properties>;
  additionalProperties: boolean;
};

// JSON schema for OpenAI strict mode: minimal required fields only.
// Optional fields are accepted but not validated by the JSON schema;
// Zod validation and defaults happen server-side.
export const researchPlanJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["objective", "tasks"],
  properties: {
    objective: {
      type: "string",
      minLength: 10,
      description: "The research objective or question to investigate",
    },
    tasks: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "detail", "modality", "successCriteria"],
        properties: {
          title: {
            type: "string",
            minLength: 3,
            description: "Task title",
          },
          detail: {
            type: "string",
            minLength: 5,
            description: "Task detail",
          },
          modality: {
            type: ["string", "null"],
            enum: ["web", "corpus", "analysis", "validation", "other", null],
            description: "Search modality",
          },
          successCriteria: {
            type: ["string", "null"],
            description: "Success criteria for the task",
          },
        },
      },
      description: "List of research tasks",
    },
  },
} as const;

type ResearchPlanJsonProperties = Record<string, JsonSchemaDefinitionEntry>;

export const researchPlanToolParameters = researchPlanJsonSchema as unknown as JsonObjectSchema<ResearchPlanJsonProperties>;

export const researchPlanTaskSchema = z.object({
  title: z.string().min(3),
  detail: z.string().min(5),
  modality: z.enum(["web", "corpus", "analysis", "validation", "other"]).nullable().default(null),
  successCriteria: z.string().min(5).nullable().default(null),
});

export const researchPlanBudgetSchema = z.object({
  webSearches: z.number().int().min(0).nullable().default(null),
  fileSearches: z.number().int().min(0).nullable().default(null),
  followUpIterations: z.number().int().min(0).nullable().default(null),
  timeboxMinutes: z.number().int().min(0).nullable().default(null),
  notes: z.string().min(3).nullable().default(null),
});

export const researchPlanSchema = z.object({
  objective: z.string().min(10),
  constraints: z.array(z.string().min(3)).default([]),
  tasks: z.array(researchPlanTaskSchema).min(1),
  budgets: researchPlanBudgetSchema.default({}),
  recencyWindow: z.string().min(3).nullable().default(null),
  openQuestions: z.array(z.string().min(3)).default([]),
  deliverableExpectation: z.string().min(3).nullable().default(null),
  metadata: z
    .object({})
    .catchall(z.string())
    .default({}),
});

export type ResearchPlan = z.infer<typeof researchPlanSchema>;

export const researchSourceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(3),
  url: z.string().url().nullable().default(null),
  description: z.string().min(3).nullable().default(null),
  badge: z.string().nullable().default(null),
  publishedAt: z.string().nullable().default(null),
});

export type ResearchSource = z.infer<typeof researchSourceSchema>;

export const researchFindingSchema = z.object({
  title: z.string().min(3),
  insight: z.string().min(10),
  confidence: z
    .enum(["low", "medium", "high"])
    .nullable()
    .default(null),
  citations: z.array(z.string().min(1)).max(8).default([]),
});

export type ResearchFinding = z.infer<typeof researchFindingSchema>;

export const researchRecommendationSchema = z.object({
  action: z.string().min(3),
  rationale: z.string().min(5).nullable().default(null),
  priority: z.enum(["immediate", "near-term", "watch"]).nullable().default(null),
  citations: z.array(z.string().min(1)).max(8).default([]),
});

export type ResearchRecommendation = z.infer<typeof researchRecommendationSchema>;

// Simplified JSON schema for OpenAI strict mode compliance (research brief)
// Only required fields in properties; optional fields accepted via additionalProperties acceptance.
export const researchBriefJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["topic", "summary", "keyFindings", "sources"],
  properties: {
    topic: {
      type: "string",
      minLength: 3,
      description: "Research topic",
    },
    summary: {
      type: "string",
      minLength: 20,
      description: "Executive summary",
    },
    keyFindings: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "insight", "confidence", "citations"],
        properties: {
          title: {
            type: "string",
            minLength: 3,
          },
          insight: {
            type: "string",
            minLength: 10,
          },
          confidence: {
            type: ["string", "null"],
            enum: ["low", "medium", "high", null],
          },
          citations: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
      description: "Key findings from research",
    },
    sources: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "url", "description", "badge", "publishedAt"],
        properties: {
          id: {
            type: "string",
            minLength: 1,
          },
          title: {
            type: "string",
            minLength: 3,
          },
          url: {
            type: ["string", "null"],
          },
          description: {
            type: ["string", "null"],
          },
          badge: {
            type: ["string", "null"],
          },
          publishedAt: {
            type: ["string", "null"],
          },
        },
      },
      description: "Research sources",
    },
  },
} as const;

export const researchBriefDeliverableSchema = z.object({
  topic: z.string().min(3),
  summary: z.string().min(20),
  keyFindings: z.array(researchFindingSchema).min(1),
  recommendations: z.array(researchRecommendationSchema).default([]),
  followUps: z.array(z.string().min(3)).default([]),
  sources: z.array(researchSourceSchema).min(1),
  metadata: z
    .object({})
    .catchall(z.unknown())
    .default({}),
});

export type ResearchBriefDeliverable = z.infer<typeof researchBriefDeliverableSchema>;

