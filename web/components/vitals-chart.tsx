"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface VitalsEntry {
  recordedAt: string;
  batteryLevel: number | null;
  temperature: number | null;
  cpuUsage: number | null;
}

export default function VitalsChart({ data }: { data: VitalsEntry[] }) {
  const chartData = data.map((d) => ({
    time: new Date(d.recordedAt).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
    battery: d.batteryLevel,
    temp: d.temperature != null ? Math.round(d.temperature * 10) / 10 : null,
    ram: d.cpuUsage != null ? Math.round(d.cpuUsage * 10) / 10 : null,
  }));

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-500">
        No vitals data yet. Data appears after the device sends heartbeats.
      </div>
    );
  }

  const hasTemp = chartData.some((d) => d.temp != null);
  const hasRam = chartData.some((d) => d.ram != null);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
        <XAxis
          dataKey="time"
          tick={{ fontSize: 11, fill: "#999" }}
          interval="preserveStartEnd"
        />
        <YAxis
          yAxisId="pct"
          domain={[0, 100]}
          tick={{ fontSize: 11, fill: "#999" }}
          label={{ value: "%", position: "insideTopLeft", fill: "#999", fontSize: 11 }}
        />
        {hasTemp && (
          <YAxis
            yAxisId="temp"
            orientation="right"
            domain={[20, 50]}
            tick={{ fontSize: 11, fill: "#999" }}
            label={{ value: "°C", position: "insideTopRight", fill: "#999", fontSize: 11 }}
          />
        )}
        <Tooltip
          contentStyle={{
            backgroundColor: "#000",
            border: "1px solid #333",
            borderRadius: 8,
            fontSize: 13,
            color: "#fff",
          }}
        />
        <Legend />
        <Line
          yAxisId="pct"
          type="monotone"
          dataKey="battery"
          stroke="#22c55e"
          strokeWidth={2}
          dot={false}
          name="Battery %"
        />
        {hasTemp && (
          <Line
            yAxisId="temp"
            type="monotone"
            dataKey="temp"
            stroke="#ef4444"
            strokeWidth={2}
            dot={false}
            name="Temp °C"
          />
        )}
        {hasRam && (
          <Line
            yAxisId="pct"
            type="monotone"
            dataKey="ram"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            name="RAM %"
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
