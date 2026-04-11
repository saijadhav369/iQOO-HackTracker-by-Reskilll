"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface AppUsageEntry {
  appPackage: string;
  appLabel: string | null;
  foregroundMinutes: number;
}

const COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

const APP_LABELS: Record<string, string> = {
  "com.vivo.pcsuite": "Office Kit",
  "com.android.chrome": "Chrome",
  "com.android.camera": "Camera",
  "com.google.android.apps.docs": "Files",
  "com.instagram.android": "Instagram",
  "com.whatsapp": "WhatsApp",
};

export default function AppUsagePie({ data }: { data: AppUsageEntry[] }) {
  const aggregated = new Map<string, { label: string; minutes: number }>();
  for (const entry of data) {
    const key = entry.appPackage;
    const existing = aggregated.get(key);
    const label = entry.appLabel || APP_LABELS[key] || key.split(".").pop() || key;
    if (existing) {
      existing.minutes += entry.foregroundMinutes;
    } else {
      aggregated.set(key, { label, minutes: entry.foregroundMinutes });
    }
  }

  const chartData = Array.from(aggregated.values())
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 8)
    .map((d) => ({ name: d.label, value: Math.round(d.minutes * 10) / 10 }));

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 font-bold">
        No usage data yet.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={chartData}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={100}
          strokeWidth={2}
          stroke="#fff"
          label={({ name, value }) => `${name}: ${value}m`}
          labelLine={false}
        >
          {chartData.map((_, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value) => [`${value} min`, "Time"]} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
