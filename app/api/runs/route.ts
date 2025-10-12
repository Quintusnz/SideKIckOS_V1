import { NextResponse } from "next/server";
import { RUN_SUMMARIES } from "@/data/runs";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ runs: RUN_SUMMARIES });
}
