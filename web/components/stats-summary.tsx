"use client";

interface StatsSummaryProps {
  stats: {
    total_taps: number;
    total_text_inputs: number;
    total_scrolls: number;
    total_app_switches: number;
    total_screen_on_minutes?: number;
    total_camera_opens?: number;
    total_clipboard_events?: number;
  };
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border-2 border-black dark:border-white bg-white dark:bg-black p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wider font-bold">{label}</p>
      <p className="text-3xl font-black tabular-nums mt-1">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
}

export default function StatsSummary({ stats }: StatsSummaryProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <StatCard label="Taps" value={stats.total_taps} />
      <StatCard label="Text Inputs" value={stats.total_text_inputs} />
      <StatCard label="Scrolls" value={stats.total_scrolls} />
      <StatCard label="App Switches" value={stats.total_app_switches} />
      {stats.total_screen_on_minutes != null && (
        <StatCard label="Screen Time" value={`${Math.round(stats.total_screen_on_minutes)}m`} />
      )}
      {stats.total_camera_opens != null && (
        <StatCard label="Camera Opens" value={stats.total_camera_opens} />
      )}
      {stats.total_clipboard_events != null && (
        <StatCard label="Clipboard" value={stats.total_clipboard_events} />
      )}
    </div>
  );
}
