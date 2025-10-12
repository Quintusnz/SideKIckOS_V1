import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { name, content } = await request.json();

  if (!name || !content) {
    return NextResponse.json({ error: "Missing name or content" }, { status: 400 });
  }

  return NextResponse.json({ documentId: randomUUID(), name });
}
