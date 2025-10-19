"use client";

import { Activity } from "lucide-react";
import { usePathname } from "next/navigation";
import { useActivitiesStream } from "@/hooks/useActivitiesStream";
import { useRunsStore } from "@/store/runs";
import { cn } from "@/utils/cn";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";

export function AppShell({ children }: { children: React.ReactNode }) {
  const lastEvent = useRunsStore((state) => state.lastEvent);
  const pathname = usePathname();
  const fullWidth = pathname?.startsWith("/workbench/modern");
  const isMobile = useIsMobile();

  const formatEventType = (value: string) =>
    value
      .split(/[._]/)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(" • ");

  const liveIndicator = lastEvent
    ? { label: formatEventType(lastEvent.type), active: true }
    : { label: "Standing By", active: false };

  useActivitiesStream();

  return (
    <SidebarProvider className="flex h-screen overflow-hidden bg-[#0f111a] text-zinc-100">
      <AppSidebar collapsible={isMobile ? "offcanvas" : "icon"} className="bg-[#0f111a]" />
      <SidebarInset className="ml-0 md:ml-0">
        <div className="flex h-full flex-col">
          <header className="flex items-center justify-between border-b border-white/5 bg-[#101526]/80 px-4 py-3">
            <SidebarTrigger className="inline-flex" aria-label="Toggle sidebar" />
            <div
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs",
                liveIndicator.active
                  ? "border-[#4e6bff]/40 bg-[#151b2f] text-[#c5d0ff]"
                  : "border-white/10 text-zinc-500",
              )}
            >
              <Activity className={cn("h-3.5 w-3.5", liveIndicator.active ? "text-[#6c7cff]" : "text-zinc-600")} />
              <span className="uppercase tracking-[0.2em]">Live</span>
              <span className="font-medium capitalize">{liveIndicator.label}</span>
            </div>
          </header>
          <main
            className={cn(
              "flex flex-1 flex-col overflow-y-auto bg-gradient-to-b from-[#101526] to-[#0f111a] p-6",
              fullWidth && "p-4 sm:p-6",
            )}
          >
            <div
              className={cn(
                "mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6",
                fullWidth && "max-w-none",
              )}
            >
              {children}
            </div>
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
