import { NextResponse } from "next/server";
import { WORKFLOW_DEFINITIONS } from "@/data/workflows";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ workflows: WORKFLOW_DEFINITIONS });
}
