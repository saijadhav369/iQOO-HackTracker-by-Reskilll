"use client";

import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

interface AppUsageEntry {
  appPackage: string;
  appLabel: string | null;
  foregroundMinutes: number;
}

// iQOO Office Kit is a toolbox of separate apps — merge them into one slice.
const OFFICE_KIT_PACKAGES = new Set([
  "com.vivo.pcsuite",
  "com.vivo.remotecontrol",
  "com.vivo.smartoffice",
]);
const OFFICE_KIT_KEY = "__office_kit__";

const APP_LABELS: Record<string, string> = {
  "com.android.chrome": "Chrome",
  "com.android.camera": "Camera",
  "com.google.android.apps.docs": "Files",
  "com.instagram.android": "Instagram",
  "com.whatsapp": "WhatsApp",
};

// Show this many distinct apps; everything else rolls into "Other" so nothing
// is silently dropped from the totals.
const MAX_SLICES = 9;

// Distinct, high-contrast palette so each app reads clearly on a dark canvas —
// the donut slice and its ranking row share the same colour.
const PALETTE = [
  "#fbb201", // primary amber
  "#22d3ee", // cyan
  "#a855f7", // purple
  "#22c55e", // green
  "#f97316", // orange
  "#ec4899", // pink
  "#3b82f6", // blue
  "#eab308", // gold
  "#14b8a6", // teal
  "#94a3b8", // slate (usually "Other")
];

interface Slice {
  name: string;
  value: number;
  color: string;
}

export default function AppUsagePie({ data }: { data: AppUsageEntry[] }) {
  const aggregated = new Map<string, { label: string; minutes: number }>();
  for (const entry of data) {
    const isOfficeKit = OFFICE_KIT_PACKAGES.has(entry.appPackage);
    const key = isOfficeKit ? OFFICE_KIT_KEY : entry.appPackage;
    const label = isOfficeKit
      ? "Office Kit"
      : entry.appLabel || APP_LABELS[key] || key.split(".").pop() || key;
    const existing = aggregated.get(key);
    if (existing) {
      existing.minutes += entry.foregroundMinutes;
    } else {
      aggregated.set(key, { label, minutes: entry.foregroundMinutes });
    }
  }

  const sorted = Array.from(aggregated.values()).sort(
    (a, b) => b.minutes - a.minutes
  );
  const head = sorted.slice(0, MAX_SLICES);
  const tail = sorted.slice(MAX_SLICES);
  const rows = head.map((d) => ({
    name: d.label,
    value: Math.round(d.minutes * 10) / 10,
  }));
  if (tail.length > 0) {
    const otherMinutes = tail.reduce((sum, d) => sum + d.minutes, 0);
    rows.push({
      name: `Other (${tail.length})`,
      value: Math.round(otherMinutes * 10) / 10,
    });
  }

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 font-bold">
        No usage data yet.
      </div>
    );
  }

  const chartData: Slice[] = rows.map((r, i) => ({
    ...r,
    color: PALETTE[i % PALETTE.length],
  }));
  const totalMinutes = chartData.reduce((acc, curr) => acc + curr.value, 0);

  return <AppUsageView chartData={chartData} totalMinutes={totalMinutes} />;
}

function AppUsageView({
  chartData,
  totalMinutes,
}: {
  chartData: Slice[];
  totalMinutes: number;
}) {
  // Index of the focused app (hover or click). null = nothing focused.
  const [active, setActive] = useState<number | null>(null);

  const focused = active != null ? chartData[active] : null;
  const focusedPct =
    focused && totalMinutes > 0 ? (focused.value / totalMinutes) * 100 : 0;

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-center">
      {/* Donut */}
      <div className="relative mx-auto h-64 w-64 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={72}
              outerRadius={active != null ? 108 : 104}
              paddingAngle={2}
              stroke="none"
              isAnimationActive={false}
              onClick={(_, i) => setActive((cur) => (cur === i ? null : i))}
              onMouseEnter={(_, i) => setActive(i)}
            >
              {chartData.map((s, i) => (
                <Cell
                  key={s.name}
                  fill={s.color}
                  fillOpacity={active != null && active !== i ? 0.2 : 1}
                  stroke={active === i ? s.color : "none"}
                  strokeWidth={active === i ? 2 : 0}
                  style={{ cursor: "pointer", outline: "none" }}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* Center readout — total, or the focused app. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {focused ? (
            <>
              <span className="max-w-[7rem] truncate text-xs font-black uppercase tracking-widest text-white">
                {focused.name}
              </span>
              <span className="mt-1 text-2xl font-black tabular-nums text-primary">
                {focused.value}m
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                {focusedPct.toFixed(1)}%
              </span>
            </>
          ) : (
            <>
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                Total
              </span>
              <span className="mt-1 text-3xl font-black tabular-nums text-white">
                {Math.round(totalMinutes)}
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                minutes
              </span>
            </>
          )}
        </div>
      </div>

      {/* Ranking list */}
      <div
        className="flex-1 space-y-4"
        onMouseLeave={() => setActive(null)}
      >
        {chartData.map((entry, index) => {
          const percentage =
            totalMinutes > 0 ? (entry.value / totalMinutes) * 100 : 0;
          const isFocused = active === index;
          const faded = active != null && !isFocused;
          return (
            <button
              key={entry.name}
              type="button"
              onClick={() => setActive((cur) => (cur === index ? null : index))}
              onMouseEnter={() => setActive(index)}
              aria-pressed={isFocused}
              className="group flex w-full flex-col gap-2 rounded-2xl px-2 py-1.5 text-left transition-all duration-200"
              style={{ opacity: faded ? 0.4 : 1 }}
            >
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-3">
                  <span
                    className="h-3 w-3 shrink-0 rounded-sm"
                    style={{
                      backgroundColor: entry.color,
                      boxShadow: isFocused ? `0 0 0 2px ${entry.color}66` : "none",
                    }}
                  />
                  <span className="text-sm font-black uppercase tracking-widest text-white">
                    {entry.name}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-base font-black tabular-nums text-primary">
                    {entry.value}m
                  </span>
                  <span className="ml-3 text-[10px] font-black uppercase tracking-widest text-gray-500 opacity-60">
                    {percentage.toFixed(1)}%
                  </span>
                </div>
              </div>

              <div className="relative h-3 w-full overflow-hidden rounded-full border border-white/5 bg-white/5">
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${percentage}%`,
                    backgroundColor: entry.color,
                    boxShadow: isFocused ? `0 0 18px ${entry.color}99` : "none",
                  }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
