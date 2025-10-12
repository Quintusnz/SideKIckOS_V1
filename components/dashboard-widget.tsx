"use client";

import { cn } from "@/utils/cn";

type DashboardWidgetProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
};

export function DashboardWidget({ title, subtitle, children, className }: DashboardWidgetProps) {
  return (
    <section
      className={cn(
        "flex h-full flex-col rounded-xl border border-white/10 bg-[#161a2a]/90 p-5 shadow-lg shadow-black/20",
        className
      )}
    >
      <header className="mb-4 space-y-1">
        <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-zinc-200">{title}</h3>
        {subtitle && <p className="text-xs text-zinc-500">{subtitle}</p>}
      </header>
      <div className="flex-1">{children}</div>
    </section>
  );
}
