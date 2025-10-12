import { NextRequest } from "next/server";
import { ACTIVITY_EVENTS } from "@/data/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("runId");
  const filtered = ACTIVITY_EVENTS.filter((event) =>
    runId ? (event.type === "step.logged" ? event.runId === runId : event.run.id === runId) : true
  );
  const events = filtered.length > 0 ? filtered : ACTIVITY_EVENTS;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let index = 0;

      const push = () => {
        const event = events[index % events.length];
        index += 1;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      push();
      const timer = setInterval(push, 4000);

      const close = () => {
        clearInterval(timer);
        controller.close();
      };

      request.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
