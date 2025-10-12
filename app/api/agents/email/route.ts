import { NextRequest, NextResponse } from "next/server";
import { runEmailAgentFromPayload } from "@/server/agents/run-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { threadId, ...rawPayload } = body as Record<string, unknown>;
    const response = await runEmailAgentFromPayload({
      payload: rawPayload,
      threadId: typeof threadId === "string" ? threadId : undefined,
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: response.reason, providerConfigured: response.providerConfigured ?? false },
        { status: 400 },
      );
    }

    return NextResponse.json({
      draft: response.deliverable.draft,
      metadata: response.deliverable.metadata,
      cacheKey: response.cacheKey,
      runId: response.runId,
      identicalToExisting: response.identicalToExisting,
      providerConfigured: response.providerConfigured,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

