"use client";

import { useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import { useRunsStore } from "@/store/runs";
import { useUIStore } from "@/store/ui";
import { cn } from "@/utils/cn";

const STATUS_COLORS: Record<string, string> = {
  running: "bg-amber-500/80",
  done: "bg-emerald-500/70",
  error: "bg-red-500/80",
  queued: "bg-slate-400/70",
};

export function RunsTray() {
  const runs = useRunsStore((state) => state.runs);
  const setRuns = useRunsStore((state) => state.setRuns);
  const activityCollapsed = useUIStore((state) => state.activityCollapsed);
  const focusedRunId = useUIStore((state) => state.focusedRunId);
  const setFocusedRun = useUIStore((state) => state.setFocusedRun);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/runs")
      .then(async (response) => {
        if (!response.ok) throw new Error(`Request failed (${response.status})`);
        const data = await response.json();
        if (!cancelled) {
          setRuns(data.runs ?? []);
          if (!useUIStore.getState().focusedRunId && data.runs?.length) {
            setFocusedRun(data.runs[0].id);
          }
        }
      })
      .catch((error) => {
        console.error("Failed to load runs", error);
      });

    return () => {
      cancelled = true;
    };
  }, [setFocusedRun, setRuns]);

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-l border-white/5 bg-[#0f111a]/95 transition-all duration-200",
        activityCollapsed ? "w-0 opacity-0 pointer-events-none" : "w-[22rem] opacity-100"
      )}
      aria-hidden={activityCollapsed}
    >
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-zinc-300">Activity</p>
          <p className="text-xs text-zinc-500">Recent orchestration runs</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <ul className="space-y-3 px-4 py-4">
          {runs.map((run) => (
            <li key={run.id}>
              <button
                type="button"
                onClick={() => setFocusedRun(run.id)}
                className={cn(
                  "w-full rounded-lg border border-white/10 bg-[#161a2a] p-3 text-left transition-colors",
                  focusedRunId === run.id ? "ring-2 ring-[#ef233c]" : "hover:bg-[#1b2035]"
                )}
              >
                <div className="flex items-center justify-between text-[13px] uppercase tracking-wide text-zinc-300">
                  <span>{run.name}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-medium uppercase text-white",
                      STATUS_COLORS[run.status] ?? STATUS_COLORS.running
                    )}
                  >
                    {run.status}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                  <span>{formatDistanceToNow(new Date(run.startedAt), { addSuffix: true })}</span>
                  <span>{Math.round(run.durationMs / 1000)}s</span>
                </div>
              </button>
            </li>
          ))}
          {runs.length === 0 && (
            <li className="text-xs text-zinc-500">No runs yet - they will appear as soon as data streams in.</li>
          )}
        </ul>
      </div>
    </aside>
  );
}
