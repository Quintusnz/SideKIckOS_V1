"use client";

import { useState } from "react";

const MODEL_OPTIONS = [
  { id: "gpt-5-mini", label: "gpt-5-mini" },
  { id: "gpt-5", label: "gpt-5" },
  { id: "gpt-5-nano", label: "gpt-5-nano" },
];

export function SettingsPanel() {
  const [model, setModel] = useState(MODEL_OPTIONS[0].id);
  const [observabilityEnabled, setObservabilityEnabled] = useState(true);

  return (
    <section className="space-y-6 rounded-2xl border border-white/10 bg-[#161a2a]/80 p-6">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-[#ef233c]">Runtime Settings</h2>
        <p className="text-sm text-zinc-400">Configure SideKick defaults for orchestrated runs.</p>
      </div>
      <div className="space-y-4">
        <fieldset className="space-y-3">
          <legend className="text-xs uppercase text-zinc-500">Default model</legend>
          <div className="grid gap-2 md:grid-cols-3">
            {MODEL_OPTIONS.map((option) => (
              <label
                key={option.id}
                className={`flex cursor-pointer items-center justify-between rounded-xl border px-3 py-2 text-sm transition ${
                  model === option.id
                    ? "border-[#ef233c] bg-[#ef233c]/10 text-zinc-100"
                    : "border-white/10 bg-[#101526] text-zinc-400 hover:border-[#ef233c]/40"
                }`}
              >
                <span>{option.label}</span>
                <input
                  type="radio"
                  name="model"
                  value={option.id}
                  checked={model === option.id}
                  onChange={() => setModel(option.id)}
                  className="sr-only"
                />
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center justify-between rounded-xl border border-white/10 bg-[#101526] px-3 py-2 text-sm text-zinc-200">
          <span>Observability collection</span>
          <button
            type="button"
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
              observabilityEnabled ? "bg-[#ef233c]" : "bg-zinc-700"
            }`}
            aria-pressed={observabilityEnabled}
            onClick={() => setObservabilityEnabled((value) => !value)}
          >
            <span
              className={`inline-block h-5 w-5 rounded-full bg-white transition ${
                observabilityEnabled ? "translate-x-5" : "translate-x-1"
              }`}
            />
          </button>
        </label>
      </div>
      <div className="rounded-xl border border-dashed border-white/15 bg-white/5 px-4 py-3 text-xs text-zinc-500">
        Changes are local mocks only – wire to platform APIs before releasing.
      </div>
    </section>
  );
}
