"use client";

import { PanelLeftClose, PanelRightClose } from "lucide-react";
import { ActivityFeed } from "@/components/activity-feed";
import { Navigation } from "@/components/navigation";
import { PaneToggle } from "@/components/pane-toggle";
import { RunsTray } from "@/components/runs-tray";
import { useActivitiesStream } from "@/hooks/useActivitiesStream";
import { useRunsStore } from "@/store/runs";
import { useUIStore } from "@/store/ui";

export function AppShell({ children }: { children: React.ReactNode }) {
  const navCollapsed = useUIStore((state) => state.navCollapsed);
  const activityCollapsed = useUIStore((state) => state.activityCollapsed);
  const toggleNav = useUIStore((state) => state.toggleNav);
  const toggleActivity = useUIStore((state) => state.toggleActivity);
  const focusedRunId = useUIStore((state) => state.focusedRunId);
  const lastEvent = useRunsStore((state) => state.lastEvent);

  useActivitiesStream();

  return (
    <div className="flex h-screen overflow-hidden bg-[#0f111a] text-zinc-100">
      <Navigation />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-white/5 bg-[#101526]/80 px-4 py-3">
          <div className="flex items-center gap-2">
            <PaneToggle
              icon={PanelLeftClose}
              pressed={navCollapsed}
              onClick={toggleNav}
              ariaLabel={navCollapsed ? "Expand navigation" : "Collapse navigation"}
            />
            <PaneToggle
              icon={PanelRightClose}
              pressed={activityCollapsed}
              onClick={toggleActivity}
              ariaLabel={activityCollapsed ? "Expand activity" : "Collapse activity"}
            />
          </div>
          <div className="text-xs text-zinc-500">
            {lastEvent ? `Live event: ${lastEvent.type}` : "Live orchestration feed idle"}
          </div>
        </header>
        <div className="flex flex-1 overflow-hidden">
          <main className="flex flex-1 flex-col overflow-y-auto bg-gradient-to-b from-[#101526] to-[#0f111a] p-6">
            <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6">{children}</div>
          </main>
          <section className="hidden w-[22rem] border-l border-white/5 bg-[#101526]/60 lg:block">
            <ActivityFeed runId={focusedRunId} />
          </section>
        </div>
      </div>
      <RunsTray />
    </div>
  );
}
