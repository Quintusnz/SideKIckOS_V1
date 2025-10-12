"use client";

import dynamic from "next/dynamic";

const StatusChart = dynamic(() => import("@/components/StatusChart"), { ssr: false });

type StatusChartDataPoint = {
  status: string;
  count: number;
};

type DashboardStatusChartProps = {
  data: StatusChartDataPoint[];
};

export function DashboardStatusChart({ data }: DashboardStatusChartProps) {
  return <StatusChart data={data} />;
}
