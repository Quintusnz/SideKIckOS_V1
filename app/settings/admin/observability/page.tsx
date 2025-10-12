import Link from "next/link";
import { RUN_SUMMARIES } from "@/data/runs";

export default function ObservabilityAdminPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-[0.35em] text-[#ef233c]">Observability</p>
        <h1 className="text-xl font-semibold text-zinc-100">Live Traces</h1>
        <p className="text-sm text-zinc-500">Select a run to inspect detailed traces and telemetry.</p>
      </header>
      <div className="space-y-3">
        {RUN_SUMMARIES.map((run) => (
          <Link
            key={run.id}
            href={`/settings/admin/observability/${run.id}`}
            className="flex items-center justify-between rounded-xl border border-white/10 bg-[#161a2a]/80 px-4 py-3 text-sm transition hover:border-[#ef233c]/60 hover:bg-[#1b2035]"
          >
            <div>
              <p className="font-medium text-zinc-100">{run.name}</p>
              <p className="text-xs text-zinc-500">Started {new Date(run.startedAt).toLocaleString()}</p>
            </div>
            <span className="text-xs uppercase text-zinc-500">{run.status}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
