import { createHash } from "crypto";
import type { EmailDraftDeliverable } from "@/models/email";

type RunOutcome = {
  cacheKey: string;
  identicalToExisting: boolean;
};

const deliverablesByKey = new Map<string, EmailDraftDeliverable>();
const runOutcomeById = new Map<string, RunOutcome>();

export const computeDeliverableKey = (payload: unknown) =>
  createHash("sha256").update(JSON.stringify(payload ?? {})).digest("hex");

export const getEmailDeliverable = (key: string) => deliverablesByKey.get(key);

export const recordEmailDeliverable = (
  runId: string,
  deliverable: EmailDraftDeliverable,
): { deliverable: EmailDraftDeliverable; identicalToExisting: boolean; cacheKey: string } => {
  const cacheKey = computeDeliverableKey({ runId, metadata: deliverable.metadata });
  const existing = deliverablesByKey.get(cacheKey);

  if (existing) {
    runOutcomeById.set(runId, { cacheKey, identicalToExisting: true });
    return { deliverable: existing, identicalToExisting: true, cacheKey };
  }

  deliverablesByKey.set(cacheKey, deliverable);
  runOutcomeById.set(runId, { cacheKey, identicalToExisting: false });

  return { deliverable, identicalToExisting: false, cacheKey };
};

export const getRunOutcome = (runId: string) => runOutcomeById.get(runId);

export const resetDeliverables = () => {
  deliverablesByKey.clear();
  runOutcomeById.clear();
};
