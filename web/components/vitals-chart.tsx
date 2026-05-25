"use client";

import { useState } from "react";
import {
  ComposedChart,
  Line,
  Bar,
  Cell,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export interface VitalsEntry {
  recordedAt: string;
  batteryLevel: number | null;
  temperature: number | null;
  cpuUsage: number | null;
  thermalStatus?: number | null;
  thermalHeadroom?: number | null;
  monsterMode?: boolean | null;
  memAvailableMb?: number | null;
  memTotalMb?: number | null;
  isCharging?: boolean | null;
  chargingType?: string | null;
  networkType?: string | null;
  cellularDbm?: number | null;
  wifiRssi?: number | null;
  dataRxMb?: number | null;
  dataTxMb?: number | null;
}

// PowerManager thermal status: index = status value, 0=NONE .. 6=SHUTDOWN.
const THERMAL_LABELS = [
  "None",
  "Light",
  "Moderate",
  "Severe",
  "Critical",
  "Emergency",
  "Shutdown",
];
// Heat ramp — cool slate at idle, deepening red as throttling escalates.
const THERMAL_COLORS = [
  "#334155", // none
  "#facc15", // light
  "#fb923c", // moderate
  "#f97316", // severe
  "#ef4444", // critical
  "#dc2626", // emergency
  "#7f1d1d", // shutdown
];
const THERMAL_MAX = THERMAL_LABELS.length - 1; // 6

// Charging ticks ride at the top of the % axis. A small amber bolt is drawn at
// each heartbeat where a power source was plugged in.
const CHARGING_TICK_Y = 100;

interface ChartPoint {
  time: string;
  battery: number | null;
  temp: number | null;
  ramAvailable: number | null;
  thermal: number | null;
  headroom: number | null;
  monster: boolean | null;
  chargingTick: number | null;
  chargingType: string | null;
  networkType: string | null;
  wifiRssi: number | null;
  cellularDbm: number | null;
  dataRxMb: number | null;
  dataTxMb: number | null;
}

// Each toggleable series in the chart, keyed for the interactive legend.
type SeriesKey =
  | "battery"
  | "charging"
  | "ramAvailable"
  | "temp"
  | "headroom"
  | "thermal";

// Numeric line metrics that get a fully-labelled axis when isolated.
type NumericKey = "battery" | "temp" | "ramAvailable" | "headroom";

interface SeriesMeta {
  key: SeriesKey;
  label: string;
  color: string;
}

const NUMERIC_METRICS: Record<
  NumericKey,
  {
    label: string;
    color: string;
    unit: string;
    dashed?: boolean;
    domain: (min: number, max: number) => [number, number];
    fmt: (v: number) => string;
  }
> = {
  battery: {
    label: "Battery",
    color: "#fbb201",
    unit: "%",
    domain: () => [0, 100],
    fmt: (v) => `${Math.round(v)}%`,
  },
  temp: {
    label: "Temperature",
    color: "#ff4444",
    unit: "°C",
    domain: (mn, mx) => [Math.floor(mn - 1), Math.ceil(mx + 1)],
    fmt: (v) => `${Math.round(v * 10) / 10}°C`,
  },
  ramAvailable: {
    label: "RAM free",
    color: "#e4e4e7",
    unit: "MB",
    domain: (_, mx) => [0, Math.ceil(mx / 100) * 100],
    fmt: (v) => `${Math.round(v)}`,
  },
  headroom: {
    label: "Thermal headroom",
    color: "#a855f7",
    unit: "ratio",
    domain: (_, mx) => [0, Math.max(1, Math.ceil(mx * 10) / 10)],
    fmt: (v) => v.toFixed(2),
  },
};

function ChargingBolt(props: { cx?: number; cy?: number; opacity?: number }) {
  const { cx, cy, opacity = 1 } = props;
  if (cx == null || cy == null) return null;
  // Tiny lightning glyph centred on the scatter point.
  return (
    <path
      d={`M ${cx - 2} ${cy - 5} L ${cx + 2} ${cy - 5} L ${cx - 1} ${cy} L ${cx + 3} ${cy} L ${cx - 3} ${cy + 6} L ${cx} ${cy + 1} L ${cx - 3} ${cy + 1} Z`}
      fill="#f59e0b"
      stroke="#fbbf24"
      strokeWidth={0.5}
      opacity={opacity}
    />
  );
}

interface TooltipPayloadItem {
  payload: ChartPoint;
}

function VitalsTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div
      style={{
        backgroundColor: "#000",
        border: "1px solid #333",
        borderRadius: 8,
        fontSize: 13,
        color: "#fff",
        padding: "8px 10px",
        lineHeight: 1.5,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
      {p.battery != null && <div>Battery: {p.battery}%</div>}
      {p.temp != null && <div>Temp: {p.temp}°C</div>}
      {p.ramAvailable != null && <div>RAM free: {p.ramAvailable} MB</div>}
      {p.thermal != null && (
        <div>
          Thermal: {THERMAL_LABELS[p.thermal] ?? p.thermal} ({p.thermal})
        </div>
      )}
      {p.headroom != null && <div>Thermal headroom: {p.headroom.toFixed(2)}</div>}
      {p.monster != null && <div>Performance mode: {p.monster ? "ON" : "off"}</div>}
      <div>
        {p.chargingTick != null
          ? `Charging${p.chargingType && p.chargingType !== "none" ? ` (${p.chargingType})` : ""}`
          : "On battery"}
      </div>
      {p.networkType && <div>Network: {p.networkType}</div>}
      {p.wifiRssi != null && <div>Wi-Fi: {p.wifiRssi} dBm</div>}
      {p.cellularDbm != null && <div>Cellular: {p.cellularDbm} dBm</div>}
      {(p.dataRxMb != null || p.dataTxMb != null) && (
        <div>
          Data: ↓{Math.round(p.dataRxMb ?? 0)} / ↑{Math.round(p.dataTxMb ?? 0)} MB
        </div>
      )}
    </div>
  );
}

// Shared axis styling.
const X_AXIS_PROPS = {
  dataKey: "time",
  tick: { fontSize: 11, fill: "#a1a1aa" },
  tickLine: false,
  axisLine: { stroke: "#3f3f46" },
  minTickGap: 48,
  interval: "preserveStartEnd" as const,
};

function StatHeader({
  items,
  color,
}: {
  items: { label: string; value: string }[];
  color: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-x-8 gap-y-2 px-1">
      {items.map((it) => (
        <div key={it.label} className="flex flex-col">
          <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
            {it.label}
          </span>
          <span className="text-xl font-black tabular-nums" style={{ color }}>
            {it.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---- Overlay view: every metric at once (the "Show all" state). ----
function OverlayChart({
  data,
  hasTemp,
  hasRam,
  hasThermal,
  hasHeadroom,
  hasCharging,
  maxRam,
  maxHeadroom,
}: {
  data: ChartPoint[];
  hasTemp: boolean;
  hasRam: boolean;
  hasThermal: boolean;
  hasHeadroom: boolean;
  hasCharging: boolean;
  maxRam: number;
  maxHeadroom: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={data} margin={{ top: 12, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="2 4" stroke="#27272a" vertical={false} />
        <XAxis {...X_AXIS_PROPS} />
        <YAxis
          yAxisId="pct"
          domain={[0, 100]}
          tick={{ fontSize: 11, fill: "#d4d4d8" }}
          tickLine={false}
          axisLine={{ stroke: "#52525b" }}
          width={42}
          label={{ value: "%", position: "insideTopLeft", fill: "#a1a1aa", fontSize: 11 }}
        />
        {hasTemp && (
          <YAxis
            yAxisId="temp"
            orientation="right"
            domain={[20, 50]}
            tick={{ fontSize: 11, fill: "#d4d4d8" }}
            tickLine={false}
            axisLine={{ stroke: "#52525b" }}
            width={42}
            label={{ value: "°C", position: "insideTopRight", fill: "#a1a1aa", fontSize: 11 }}
          />
        )}
        {hasThermal && <YAxis yAxisId="thermal" hide domain={[0, THERMAL_MAX]} />}
        {hasRam && <YAxis yAxisId="ram" hide domain={[0, maxRam]} />}
        {hasHeadroom && <YAxis yAxisId="headroom" hide domain={[0, maxHeadroom]} />}
        <Tooltip content={<VitalsTooltip />} cursor={{ stroke: "#52525b", strokeWidth: 1 }} />

        {hasThermal && (
          <Bar
            yAxisId="thermal"
            dataKey="thermal"
            name="Thermal status"
            barSize={6}
            fillOpacity={0.55}
            isAnimationActive={false}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={THERMAL_COLORS[d.thermal ?? 0] ?? THERMAL_COLORS[0]} />
            ))}
          </Bar>
        )}

        <Line
          yAxisId="pct"
          type="monotone"
          dataKey="battery"
          stroke="#fbb201"
          strokeWidth={2.5}
          dot={false}
          name="Battery %"
          isAnimationActive={false}
        />
        {hasTemp && (
          <Line
            yAxisId="temp"
            type="monotone"
            dataKey="temp"
            stroke="#ff4444"
            strokeWidth={2}
            dot={false}
            name="Temp °C"
            isAnimationActive={false}
          />
        )}
        {hasRam && (
          <Line
            yAxisId="ram"
            type="monotone"
            dataKey="ramAvailable"
            stroke="#e4e4e7"
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={false}
            name="RAM free (MB)"
            isAnimationActive={false}
          />
        )}
        {hasHeadroom && (
          <Line
            yAxisId="headroom"
            type="monotone"
            dataKey="headroom"
            stroke="#a855f7"
            strokeWidth={2}
            dot={false}
            name="Thermal headroom"
            isAnimationActive={false}
          />
        )}
        {hasCharging && (
          <Scatter
            yAxisId="pct"
            dataKey="chargingTick"
            name="Charging"
            shape={<ChargingBolt />}
            isAnimationActive={false}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ---- Isolated view: a single metric on its own, fully-labelled axis. ----
function IsolatedChart({ data, metric }: { data: ChartPoint[]; metric: SeriesKey }) {
  // Thermal status — coloured severity bars on a named-category axis.
  if (metric === "thermal") {
    const series = data.filter((d) => d.thermal != null);
    const last = series[series.length - 1]?.thermal ?? 0;
    return (
      <div>
        <StatHeader
          items={[{ label: "Current", value: THERMAL_LABELS[last] ?? String(last) }]}
          color={THERMAL_COLORS[last] ?? THERMAL_COLORS[0]}
        />
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={series} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="#27272a" vertical={false} />
            <XAxis {...X_AXIS_PROPS} />
            <YAxis
              domain={[0, THERMAL_MAX]}
              ticks={[0, 1, 2, 3, 4, 5, 6]}
              tickFormatter={(v: number) => THERMAL_LABELS[v] ?? String(v)}
              tick={{ fontSize: 10, fill: "#d4d4d8" }}
              tickLine={false}
              axisLine={{ stroke: "#52525b" }}
              width={86}
            />
            <Tooltip content={<VitalsTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
            <Bar dataKey="thermal" name="Thermal status" barSize={10} isAnimationActive={false}>
              {series.map((d, i) => (
                <Cell key={i} fill={THERMAL_COLORS[d.thermal ?? 0] ?? THERMAL_COLORS[0]} />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Charging — battery line with amber bolts marking plugged-in heartbeats.
  if (metric === "charging") {
    const series = data.filter((d) => d.battery != null || d.chargingTick != null);
    const chargingCount = data.filter((d) => d.chargingTick != null).length;
    return (
      <div>
        <StatHeader
          items={[{ label: "Charging samples", value: String(chargingCount) }]}
          color="#f59e0b"
        />
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={series} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="#27272a" vertical={false} />
            <XAxis {...X_AXIS_PROPS} />
            <YAxis
              domain={[0, 100]}
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fontSize: 11, fill: "#d4d4d8" }}
              tickLine={false}
              axisLine={{ stroke: "#52525b" }}
              width={48}
              label={{ value: "Battery %", angle: -90, position: "insideLeft", fill: "#a1a1aa", fontSize: 11 }}
            />
            <Tooltip content={<VitalsTooltip />} cursor={{ stroke: "#52525b", strokeWidth: 1 }} />
            <Line
              type="monotone"
              dataKey="battery"
              stroke="#fbb201"
              strokeWidth={2.5}
              dot={false}
              name="Battery %"
              isAnimationActive={false}
              connectNulls
            />
            <Scatter
              dataKey="chargingTick"
              name="Charging"
              shape={<ChargingBolt />}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="mt-2 text-center text-[11px] text-zinc-500">
          ⚡ bolts mark heartbeats where a charger was connected; the line is battery %.
        </p>
      </div>
    );
  }

  // Numeric line metrics (battery / temp / RAM / headroom).
  const cfg = NUMERIC_METRICS[metric];
  const series = data.filter((d) => d[metric] != null);
  const vals = series.map((d) => d[metric] as number);

  if (vals.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-zinc-500">
        No {cfg.label.toLowerCase()} samples recorded.
      </div>
    );
  }

  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const last = vals[vals.length - 1];
  const [lo, hi] = cfg.domain(min, max);

  return (
    <div>
      <StatHeader
        items={[
          { label: "Now", value: cfg.fmt(last) },
          { label: "Min", value: cfg.fmt(min) },
          { label: "Max", value: cfg.fmt(max) },
        ]}
        color={cfg.color}
      />
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={series} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="#27272a" vertical={false} />
          <XAxis {...X_AXIS_PROPS} />
          <YAxis
            domain={[lo, hi]}
            tickFormatter={cfg.fmt}
            tick={{ fontSize: 11, fill: "#d4d4d8" }}
            tickLine={false}
            axisLine={{ stroke: "#52525b" }}
            width={64}
            label={{ value: cfg.unit, angle: -90, position: "insideLeft", fill: "#a1a1aa", fontSize: 11 }}
          />
          <Tooltip content={<VitalsTooltip />} cursor={{ stroke: "#52525b", strokeWidth: 1 }} />
          <Line
            type="monotone"
            dataKey={metric}
            stroke={cfg.color}
            strokeWidth={2.5}
            dot={false}
            name={cfg.label}
            isAnimationActive={false}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function VitalsChart({ data }: { data: VitalsEntry[] }) {
  // null = overlay all metrics; a key = isolate that metric on its own axis.
  const [active, setActive] = useState<SeriesKey | null>(null);

  const chartData: ChartPoint[] = data.map((d) => ({
    time: new Date(d.recordedAt).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
    battery: d.batteryLevel,
    temp: d.temperature != null ? Math.round(d.temperature * 10) / 10 : null,
    ramAvailable: d.memAvailableMb ?? null,
    thermal: d.thermalStatus ?? null,
    headroom: d.thermalHeadroom ?? null,
    monster: d.monsterMode ?? null,
    chargingTick: d.isCharging ? CHARGING_TICK_Y : null,
    chargingType: d.chargingType ?? null,
    networkType: d.networkType ?? null,
    wifiRssi: d.wifiRssi ?? null,
    cellularDbm: d.cellularDbm ?? null,
    dataRxMb: d.dataRxMb ?? null,
    dataTxMb: d.dataTxMb ?? null,
  }));

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-500">
        No vitals data yet. Data appears after the device sends heartbeats.
      </div>
    );
  }

  const hasTemp = chartData.some((d) => d.temp != null);
  const hasRam = chartData.some((d) => d.ramAvailable != null);
  const hasThermal = chartData.some((d) => d.thermal != null);
  const hasHeadroom = chartData.some((d) => d.headroom != null);
  const hasCharging = chartData.some((d) => d.chargingTick != null);
  const maxRam = Math.max(1, ...chartData.map((d) => d.ramAvailable ?? 0));
  const maxHeadroom = Math.max(1, ...chartData.map((d) => d.headroom ?? 0));

  const legend: SeriesMeta[] = [
    { key: "battery", label: "Battery %", color: "#fbb201" },
    ...(hasCharging ? [{ key: "charging" as const, label: "Charging", color: "#f59e0b" }] : []),
    ...(hasRam ? [{ key: "ramAvailable" as const, label: "RAM free (MB)", color: "#e4e4e7" }] : []),
    ...(hasTemp ? [{ key: "temp" as const, label: "Temp °C", color: "#ff4444" }] : []),
    ...(hasHeadroom ? [{ key: "headroom" as const, label: "Thermal headroom", color: "#a855f7" }] : []),
    ...(hasThermal ? [{ key: "thermal" as const, label: "Thermal status", color: "#ef4444" }] : []),
  ];

  const toggle = (key: SeriesKey) => setActive((cur) => (cur === key ? null : key));

  return (
    <div>
      {active === null ? (
        <OverlayChart
          data={chartData}
          hasTemp={hasTemp}
          hasRam={hasRam}
          hasThermal={hasThermal}
          hasHeadroom={hasHeadroom}
          hasCharging={hasCharging}
          maxRam={maxRam}
          maxHeadroom={maxHeadroom}
        />
      ) : (
        <IsolatedChart data={chartData} metric={active} />
      )}

      {/* Interactive legend — click a metric to isolate it on its own labelled
          axis; click again (or "Show all") to overlay everything. */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        {legend.map((s) => {
          const focused = active === s.key;
          const faded = active != null && !focused;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => toggle(s.key)}
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
        {active != null && (
          <button
            type="button"
            onClick={() => setActive(null)}
            className="rounded-md px-2 py-1 text-xs text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline"
          >
            Show all
          </button>
        )}
      </div>

      <p className="mt-1 text-center text-[11px] text-zinc-500">
        {active == null
          ? "Left axis = %, right axis = °C. Other metrics are scaled to fit — click one to read its real values."
          : "Showing one metric on its true scale. Click it again or “Show all” to overlay everything."}
      </p>
    </div>
  );
}
