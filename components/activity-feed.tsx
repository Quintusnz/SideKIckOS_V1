"use client";

import { useEffect, useState } from "react";
import type { ActivityRun } from "@/models/activity";
import { useRunsStore } from "@/store/runs";
import { cn } from "@/utils/cn";

export function ActivityFeed({ runId }: { runId?: string }) {
  const [run, setRun] = useState<ActivityRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const lastEvent = useRunsStore((state) => state.lastEvent);

  useEffect(() => {
    if (!runId) {
      setRun(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/runs/${runId}`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Request failed: ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) {
          setRun(data.run);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [runId]);

  useEffect(() => {
    if (!runId || !lastEvent) return;

    if (lastEvent.type === "step.logged" && lastEvent.runId === runId) {
      setRun((current) => {
        if (!current) return current;
        const exists = current.steps.some((step) => step.id === lastEvent.step.id);
        if (exists) return current;
        return {
          ...current,
          steps: [...current.steps, lastEvent.step],
          status: lastEvent.step.status,
        };
      });
    }

    if ((lastEvent.type === "run.updated" || lastEvent.type === "run.completed") && lastEvent.run.id === runId) {
      setRun(lastEvent.run);
    }
  }, [lastEvent, runId]);

  if (!runId) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-sm text-zinc-500">
        Select a run from the activity list to inspect its live logs.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col gap-3 px-6 py-8 text-sm text-zinc-500">
        <div className="h-4 w-32 animate-pulse rounded bg-white/10" />
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-3 w-full animate-pulse rounded bg-white/5" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-sm text-red-400">
        Failed to load run: {error}
      </div>
    );
  }

  if (!run) {
    return null;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="border-b border-white/5 px-6 py-4">
        <p className="text-xs uppercase tracking-widest text-zinc-500">Focused run</p>
        <h2 className="text-base font-semibold text-zinc-100">{run.name}</h2>
        <p className="text-xs text-zinc-500">Status: {run.status}</p>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <ul className="space-y-4">
          {run.steps.map((step) => (
            <li
              key={step.id}
              className="rounded-lg border border-white/10 bg-[#161a2a] p-3 text-sm text-zinc-300"
            >
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>{new Date(step.timestamp).toLocaleTimeString()}</span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] uppercase text-white",
                    step.status === "running" && "bg-amber-500/70",
                    step.status === "done" && "bg-emerald-500/70",
                    step.status === "error" && "bg-red-500/80",
                    step.status === "queued" && "bg-slate-500/60"
                  )}
                >
                  {step.status}
                </span>
              </div>
              <p className="mt-2 text-sm text-zinc-200">{step.message}</p>
            </li>
          ))}
          {run.steps.length === 0 && (
            <li className="text-xs text-zinc-500">No logs yet for this run.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
