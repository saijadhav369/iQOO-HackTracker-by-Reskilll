"use client";

import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  YAxis,
} from "recharts";

export interface SensorEntry {
  periodStart: string;
  accelMean: number | null;
  accelStddev: number | null;
  accelPeak: number | null;
  gyroMean: number | null;
  gyroStddev: number | null;
  gyroPeak: number | null;
  magnetoMean: number | null;
  luxMean: number | null;
  proximityNearPct: number | null;
  stepsDelta: number | null;
}

type MetricKey = Exclude<keyof SensorEntry, "periodStart">;

interface PanelSpec {
  key: MetricKey;
  title: string;
  unit: string;
  color: string;
  decimals: number;
}

const PANELS: PanelSpec[] = [
  { key: "accelMean",        title: "Accel (mean)",   unit: "m/s²",   color: "#c084fc", decimals: 2 },
  { key: "accelStddev",      title: "Accel (stddev)", unit: "m/s²",   color: "#a855f7", decimals: 2 },
  { key: "accelPeak",        title: "Accel (peak)",   unit: "m/s²",   color: "#7c3aed", decimals: 2 },
  { key: "gyroMean",         title: "Gyro (mean)",    unit: "rad/s",  color: "#67e8f9", decimals: 3 },
  { key: "gyroStddev",       title: "Gyro (stddev)",  unit: "rad/s",  color: "#06b6d4", decimals: 3 },
  { key: "gyroPeak",         title: "Gyro (peak)",    unit: "rad/s",  color: "#0891b2", decimals: 3 },
  { key: "magnetoMean",      title: "Magnetometer",   unit: "μT",     color: "#f59e0b", decimals: 1 },
  { key: "luxMean",          title: "Light",          unit: "lux",    color: "#eab308", decimals: 0 },
  { key: "proximityNearPct", title: "Proximity",      unit: "% near", color: "#ec4899", decimals: 0 },
  { key: "stepsDelta",       title: "Steps",          unit: "/ min",  color: "#22c55e", decimals: 0 },
];

function formatValue(v: number | null | undefined, decimals: number): string {
  if (v == null) return "—";
  const factor = Math.pow(10, decimals);
  return (Math.round(v * factor) / factor).toString();
}

function Panel({
  data,
  spec,
}: {
  data: SensorEntry[];
  spec: PanelSpec;
}) {
  // Latest non-null value for the headline number.
  let last: number | null = null;
  for (let i = data.length - 1; i >= 0; i--) {
    const v = data[i][spec.key];
    if (v != null) {
      last = v;
      break;
    }
  }

  const series = data.map((d) => ({
    time: new Date(d.periodStart).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
    v: d[spec.key],
  }));

  const hasAny = series.some((s) => s.v != null);

  return (
    <div className="border border-black/5 dark:border-white/5 rounded-2xl p-4 bg-white dark:bg-white/5 shadow-lg group hover:border-primary/50 transition-all duration-300">
      <div className="flex justify-between items-baseline mb-2">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 group-hover:text-primary transition-colors">{spec.title}</h3>
        <span className="text-[9px] text-gray-500 font-black uppercase tracking-tight opacity-50">{spec.unit}</span>
      </div>
      <div className="text-2xl font-black tabular-nums tracking-tighter mb-4" style={{ color: spec.color }}>
        {formatValue(last, spec.decimals)}
      </div>
      <div className="h-16">
        {hasAny ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
              <YAxis hide domain={["dataMin", "dataMax"]} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#000",
                  border: "1px solid #333",
                  borderRadius: 6,
                  fontSize: 11,
                  color: "#fff",
                  padding: "4px 8px",
                }}
                formatter={(value) =>
                  typeof value === "number" ? formatValue(value, spec.decimals) : String(value ?? "")
                }
                labelStyle={{ color: "#999" }}
              />
              <Line
                type="monotone"
                dataKey="v"
                stroke={spec.color}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-[10px] text-gray-500 italic">
            no samples
          </div>
        )}
      </div>
    </div>
  );
}

export default function SensorPanels({ data }: { data: SensorEntry[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-zinc-500">
        No sensor data yet. Aggregates appear once the device finishes a 60s window.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {PANELS.map((spec) => (
        <Panel key={spec.key} data={data} spec={spec} />
      ))}
    </div>
  );
}
