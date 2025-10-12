import { DashboardStatusChart } from "@/components/dashboard-status-chart";
import { DashboardGrid } from "@/components/dashboard-grid";
import { DashboardWidget } from "@/components/dashboard-widget";
import { RUN_SUMMARIES } from "@/data/runs";

export default function DashboardPage() {
  const statusCounts = RUN_SUMMARIES.reduce<Record<string, number>>((acc, run) => {
    acc[run.status] = (acc[run.status] ?? 0) + 1;
    return acc;
  }, {});

  const chartData = Object.entries(statusCounts).map(([status, count]) => ({ status, count }));

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-[0.4em] text-[#ef233c]">Oversight</p>
        <h1 className="text-xl font-semibold text-zinc-100">Operational Dashboard</h1>
        <p className="text-sm text-zinc-500">Live view of orchestration health and throughput.</p>
      </header>
      <DashboardGrid>
        <DashboardWidget title="Status by Run" subtitle="Last 10 runs" className="col-span-1 xl:col-span-2">
          <DashboardStatusChart data={chartData} />
        </DashboardWidget>
        <DashboardWidget title="Latest Runs" subtitle="In chronological order">
          <ul className="space-y-3 text-sm text-zinc-300">
            {RUN_SUMMARIES.slice(0, 5).map((run) => (
              <li key={run.id} className="flex items-center justify-between">
                <span>{run.name}</span>
                <span className="text-xs uppercase text-zinc-500">{run.status}</span>
              </li>
            ))}
          </ul>
        </DashboardWidget>
      </DashboardGrid>
    </div>
  );
}
