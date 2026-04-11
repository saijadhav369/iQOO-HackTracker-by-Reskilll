"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface TimelineEntry {
  periodStart: string;
  taps: number | null;
  foregroundApp: string | null;
}

export default function TapTimelineChart({ data }: { data: TimelineEntry[] }) {
  const chartData = data.map((d) => ({
    time: new Date(d.periodStart).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
    taps: d.taps ?? 0,
  }));

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 font-bold">
        No timeline data yet.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
        <XAxis dataKey="time" tick={{ fontSize: 11, fill: "#999" }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 11, fill: "#999" }} />
        <Tooltip
          contentStyle={{
            backgroundColor: "#000",
            border: "2px solid #fff",
            borderRadius: 8,
            fontSize: 13,
            color: "#fff",
          }}
          formatter={(value) => [String(value), "Taps"]}
        />
        <Bar dataKey="taps" fill="#3b82f6" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
