import { beforeEach, describe, expect, it } from "vitest";
import { runEmailDraftFallback } from "@/server/agents/email-fallback";
import { runEmailAgentFromPayload } from "@/server/agents/run-email";
import { resetDeliverables } from "@/server/agents/store/deliverables";

const baseInput = {
  recipient: "Alex Rivera",
  tone: "friendly",
  keyPoints: ["Confirm deployment timeline", "Highlight compliance summary"],
  additionalContext: "Reference the updated pricing schedule from 11/10.",
  variants: 2,
};

describe("Email draft agent", () => {
  beforeEach(() => {
    resetDeliverables();
  });

  it("builds a subject that references the leading key point", async () => {
    const result = await runEmailDraftFallback(baseInput, { runId: "test-run" });
    expect(result.deliverable.draft.subject.toLowerCase()).toContain("confirm deployment timeline".toLowerCase().slice(0, 10));
    expect(result.deliverable.draft.body).toContain("Confirm deployment timeline");
    expect(result.deliverable.draft.variants).toHaveLength(2);
  });

  it("is idempotent when invoked with the same run identifier", async () => {
    const first = await runEmailDraftFallback(baseInput, { runId: "cached-run" });
    const second = await runEmailDraftFallback(baseInput, { runId: "cached-run" });

    expect(second.identicalToExisting).toBe(true);
    expect(second.cacheKey).toBe(first.cacheKey);
    expect(second.deliverable.draft.body).toBe(first.deliverable.draft.body);
  });

  it("blocks requests flagged by guardrails", async () => {
    const response = await runEmailAgentFromPayload({
      payload: {
        ...baseInput,
        keyPoints: ["Share password details"],
      },
    });

    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.reason).toMatch(/sensitive information/i);
    }
  });
});

