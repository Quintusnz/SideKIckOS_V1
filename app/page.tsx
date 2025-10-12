import { ChatPanel } from "@/components/chat-panel";
import { DashboardWidget } from "@/components/dashboard-widget";
import { RUN_SUMMARIES } from "@/data/runs";

export default function HomePage() {
  const totalRuns = RUN_SUMMARIES.length;
  const runningRuns = RUN_SUMMARIES.filter((run) => run.status === "running").length;
  const errorRuns = RUN_SUMMARIES.filter((run) => run.status === "error").length;

  return (
    <div className="flex flex-1 flex-col gap-6">
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <DashboardWidget title="Active Runs" subtitle="Currently streaming">
          <p className="text-3xl font-semibold text-zinc-100">{runningRuns}</p>
        </DashboardWidget>
        <DashboardWidget title="Total Runs" subtitle="Past 24 hours">
          <p className="text-3xl font-semibold text-zinc-100">{totalRuns}</p>
        </DashboardWidget>
        <DashboardWidget title="Errors" subtitle="Requires attention">
          <p className="text-3xl font-semibold text-[#ef233c]">{errorRuns}</p>
        </DashboardWidget>
      </section>
      <ChatPanel />
    </div>
  );
}
