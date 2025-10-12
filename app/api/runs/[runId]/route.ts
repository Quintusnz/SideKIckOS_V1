import { NextRequest, NextResponse } from "next/server";
import { getRun } from "@/data/runs";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ runId: string }> }) {
  const params = await context.params;
  const run = getRun(params.runId);

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  return NextResponse.json({ run });
}
