"use client";

interface StatsSummaryProps {
  stats: {
    total_taps: number;
    total_text_inputs: number;
    total_scrolls: number;
    total_app_switches: number;
    total_keyboard_seconds?: number;
    total_office_kit_minutes?: number;
    total_screen_on_minutes?: number;
    total_camera_opens?: number;
    total_clipboard_events?: number;
  };
}

function formatKeyboardTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function StatCard({ label, value, isPrimary }: { label: string; value: string | number; isPrimary?: boolean }) {
  return (
    <div className={`rounded-2xl border-2 transition-all duration-300 ${
      isPrimary
        ? "border-primary bg-primary/10 shadow-[0_0_20px_rgba(251,178,1,0.1)]"
        : "border-black/5 dark:border-white/5 bg-white dark:bg-white/5"
    } p-5 hover:translate-y-[-2px]`}>
      <p className={`text-[10px] uppercase tracking-widest font-black ${isPrimary ? "text-primary" : "text-gray-400"}`}>{label}</p>
      <p className={`text-3xl font-black tabular-nums mt-2 tracking-tighter ${isPrimary ? "text-primary" : ""}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
}

export default function StatsSummary({ stats }: StatsSummaryProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      <StatCard label="Taps" value={stats.total_taps} />
      <StatCard label="Office Kit" value={`${stats.total_office_kit_minutes ?? 0}m`} isPrimary />
      <StatCard label="Text Inputs" value={stats.total_text_inputs} />
      <StatCard label="Scrolls" value={stats.total_scrolls} />
      <StatCard label="App Switches" value={stats.total_app_switches} />
      {stats.total_keyboard_seconds != null && (
        <StatCard label="Keyboard Time" value={formatKeyboardTime(stats.total_keyboard_seconds)} />
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
