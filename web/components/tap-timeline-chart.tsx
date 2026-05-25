"use client";

import { useState } from "react";
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
  textInputs?: number | null;
  scrolls?: number | null;
  appSwitches?: number | null;
  foregroundApp: string | null;
}

// The activity types that make up each time bucket. Stacking them shows both
// the total interaction volume and what it was made of.
type SeriesKey = "taps" | "scrolls" | "textInputs" | "appSwitches";

interface SeriesMeta {
  key: SeriesKey;
  label: string;
  color: string;
}

const SERIES: SeriesMeta[] = [
  { key: "taps", label: "Taps", color: "#fbb201" },
  { key: "scrolls", label: "Scrolls", color: "#22d3ee" },
  { key: "textInputs", label: "Text inputs", color: "#a855f7" },
  { key: "appSwitches", label: "App switches", color: "#22c55e" },
];

interface ChartPoint {
  time: string;
  taps: number;
  scrolls: number;
  textInputs: number;
  appSwitches: number;
  total: number;
}

interface TooltipPayloadItem {
  payload: ChartPoint;
}

function ActivityTooltip({
  active,
  payload,
  label,
  focus,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  focus: SeriesKey | null;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div
      style={{
        backgroundColor: "#0a0a0a",
        border: "1px solid #fbb201",
        borderRadius: 12,
        fontSize: 13,
        color: "#fff",
        padding: "10px 12px",
        boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
        lineHeight: 1.6,
      }}
    >
      <div style={{ fontWeight: 800, marginBottom: 4 }}>{label}</div>
      {SERIES.map((s) => {
        const v = p[s.key];
        if (focus && focus !== s.key) return null;
        return (
          <div
            key={s.key}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <span
              style={{
                display: "inline-block",
                width: 9,
                height: 9,
                borderRadius: 2,
                backgroundColor: s.color,
              }}
            />
            <span style={{ color: "#a1a1aa" }}>{s.label}:</span>
            <span style={{ fontWeight: 700 }}>{v}</span>
          </div>
        );
      })}
      {!focus && (
        <div style={{ marginTop: 4, color: "#71717a", fontSize: 11 }}>
          Total: {p.total}
        </div>
      )}
    </div>
  );
}

export default function TapTimelineChart({ data }: { data: TimelineEntry[] }) {
  // Click a legend item to focus that activity type; click again to clear.
  const [focus, setFocus] = useState<SeriesKey | null>(null);

  const chartData: ChartPoint[] = data.map((d) => {
    const taps = d.taps ?? 0;
    const scrolls = d.scrolls ?? 0;
    const textInputs = d.textInputs ?? 0;
    const appSwitches = d.appSwitches ?? 0;
    return {
      time: new Date(d.periodStart).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
      taps,
      scrolls,
      textInputs,
      appSwitches,
      total: taps + scrolls + textInputs + appSwitches,
    };
  });

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 font-bold">
        No timeline data yet.
      </div>
    );
  }

  // Hide series that never have a value so the legend stays meaningful.
  const visible = SERIES.filter((s) =>
    chartData.some((d) => d[s.key] > 0)
  );
  const shown = visible.length > 0 ? visible : SERIES;

  return (
    <div>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={chartData} margin={{ top: 16, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.08)" vertical={false} />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 11, fill: "#a1a1aa" }}
            axisLine={{ stroke: "rgba(255,255,255,0.12)" }}
            tickLine={false}
            dy={8}
            minTickGap={48}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#a1a1aa" }}
            axisLine={false}
            tickLine={false}
            width={36}
            allowDecimals={false}
            label={{ value: focus ? shownLabel(focus) : "INTERACTIONS", angle: -90, position: "insideLeft", fill: "#71717a", fontSize: 10, style: { letterSpacing: 1 } }}
          />
          <Tooltip
            content={<ActivityTooltip focus={focus} />}
            cursor={{ fill: "rgba(251,178,1,0.08)" }}
          />
          {shown.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              stackId="activity"
              name={s.label}
              fill={s.color}
              fillOpacity={focus && focus !== s.key ? 0.12 : 1}
              maxBarSize={32}
              isAnimationActive={false}
              // Round only the visual top of the stack.
              radius={s.key === shown[shown.length - 1].key ? [4, 4, 0, 0] : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>

      {/* Interactive legend — click to focus one activity type, click again to
          show the whole stack. */}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        {shown.map((s) => {
          const focused = focus === s.key;
          const faded = focus != null && !focused;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setFocus((cur) => (cur === s.key ? null : s.key))}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-white/5"
              style={{ opacity: faded ? 0.4 : 1 }}
              aria-pressed={focused}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{
                  backgroundColor: s.color,
                  boxShadow: focused ? `0 0 0 2px ${s.color}66` : "none",
                }}
              />
              <span
                style={{
                  color: s.color,
                  textDecoration: focused ? "underline" : "none",
                  textUnderlineOffset: 3,
                }}
              >
                {s.label}
              </span>
            </button>
          );
        })}
        {focus != null && (
          <button
            type="button"
            onClick={() => setFocus(null)}
            className="rounded-md px-2 py-1 text-xs text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline"
          >
            Show all
          </button>
        )}
      </div>
    </div>
  );
}

function shownLabel(key: SeriesKey): string {
  return (SERIES.find((s) => s.key === key)?.label ?? "").toUpperCase();
}
