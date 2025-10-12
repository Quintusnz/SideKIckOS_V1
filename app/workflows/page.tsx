import { WORKFLOW_DEFINITIONS } from "@/data/workflows";
import { PlayCircle } from "lucide-react";

export default function WorkflowsPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-[0.35em] text-[#ef233c]">Workflows</p>
        <h1 className="text-xl font-semibold text-zinc-100">Automation Catalog</h1>
        <p className="text-sm text-zinc-500">Browse orchestrations available to SideKick agents.</p>
      </header>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {WORKFLOW_DEFINITIONS.map((workflow) => (
          <article
            key={workflow.id}
            className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#161a2a]/90 p-5"
          >
            <header className="space-y-1">
              <h2 className="text-lg font-semibold text-zinc-100">{workflow.name}</h2>
              <p className="text-sm text-zinc-400">{workflow.description}</p>
            </header>
            <ul className="space-y-2 text-sm text-zinc-300">
              {workflow.steps.map((step) => (
                <li key={step.id} className="flex items-start gap-3">
                  <span className="mt-1 h-2 w-2 rounded-full bg-[#ef233c]" aria-hidden />
                  <div>
                    <p className="font-medium text-zinc-200">{step.label}</p>
                    <p className="text-xs text-zinc-500">{step.description}</p>
                  </div>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="inline-flex items-center gap-2 self-start rounded-full border border-[#ef233c]/50 px-4 py-2 text-sm text-[#ef233c] transition hover:border-[#ef233c] hover:bg-[#ef233c]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ef233c]"
            >
              <PlayCircle className="h-4 w-4" />
              Queue Run
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
