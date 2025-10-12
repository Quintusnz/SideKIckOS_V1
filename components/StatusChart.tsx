"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Props = {
  data: Array<{ status: string; count: number }>;
};

export default function StatusChart({ data }: Props) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="status" stroke="#71717a" tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} stroke="#71717a" tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#161a2a",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              color: "white",
            }}
          />
          <Bar dataKey="count" fill="#ef233c" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
