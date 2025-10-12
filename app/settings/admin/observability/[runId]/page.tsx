import Link from "next/link";
import { notFound } from "next/navigation";
import { getRun } from "@/data/runs";

export default function ObservabilityRunPage({ params }: { params: { runId: string } }) {
  const run = getRun(params.runId);

  if (!run) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-[0.35em] text-[#ef233c]">Observability</p>
        <h1 className="text-xl font-semibold text-zinc-100">{run.name}</h1>
        <p className="text-sm text-zinc-500">Detailed trace log from orchestrated run.</p>
        <Link href="/settings/admin/observability" className="text-xs text-[#ef233c] underline">
          Back to runs
        </Link>
      </header>
      <section className="rounded-2xl border border-white/10 bg-[#161a2a]/80 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-zinc-200">Timeline</h2>
        <ul className="mt-4 space-y-3 text-sm text-zinc-300">
          {run.steps.map((step) => (
            <li key={step.id} className="flex items-start gap-3">
              <span className="mt-1 h-2 w-2 rounded-full bg-[#ef233c]" aria-hidden />
              <div>
                <p className="font-medium text-zinc-100">{step.message}</p>
                <p className="text-xs text-zinc-500">
                  {new Date(step.timestamp).toLocaleString()} · Status: {step.status}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
