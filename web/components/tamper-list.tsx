"use client";

export interface TamperEntry {
  id: number;
  type: string;
  detail: Record<string, unknown> | null;
  occurredAt: string;
  resolvedAt: string | null;
}

// Human labels + colour per tamper type. Unknown types fall back to the raw
// type string in a neutral badge so new device-side types still render.
const TYPE_META: Record<string, { label: string; cls: string }> = {
  settings_page_open: {
    label: "Settings page opened",
    cls: "bg-red-200 dark:bg-red-900 text-red-900 dark:text-red-100",
  },
  adb_toggled: {
    label: "ADB toggled",
    cls: "bg-orange-200 dark:bg-orange-900 text-orange-900 dark:text-orange-100",
  },
  time_drift: {
    label: "Clock drift",
    cls: "bg-purple-200 dark:bg-purple-900 text-purple-900 dark:text-purple-100",
  },
  safe_mode_boot: {
    label: "Safe-mode boot",
    cls: "bg-red-300 dark:bg-red-800 text-red-950 dark:text-red-50",
  },
  package_added: {
    label: "Package installed",
    cls: "bg-yellow-200 dark:bg-yellow-900 text-yellow-900 dark:text-yellow-100",
  },
  package_removed: {
    label: "Package removed",
    cls: "bg-yellow-200 dark:bg-yellow-900 text-yellow-900 dark:text-yellow-100",
  },
  lock_task_engaged: {
    label: "Lock-task engaged",
    cls: "bg-blue-200 dark:bg-blue-900 text-blue-900 dark:text-blue-100",
  },
};

function meta(type: string): { label: string; cls: string } {
  return (
    TYPE_META[type] ?? {
      label: type,
      cls: "bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100",
    }
  );
}

function detailText(detail: Record<string, unknown> | null): string | null {
  if (!detail || Object.keys(detail).length === 0) return null;
  return Object.entries(detail)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}

export default function TamperList({ entries }: { entries: TamperEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border-2 border-black dark:border-white bg-white dark:bg-black p-6 text-center text-sm text-gray-500 font-bold">
        No tamper events logged.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {entries.map((entry) => {
        const m = meta(entry.type);
        const detail = detailText(entry.detail);
        return (
          <div
            key={entry.id}
            className="rounded-xl border-2 border-black dark:border-white bg-white dark:bg-black px-4 py-3"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`px-2 py-0.5 text-xs font-bold uppercase tracking-wider rounded ${m.cls}`}
              >
                {m.label}
              </span>
              {entry.resolvedAt && (
                <span className="px-2 py-0.5 text-xs font-bold uppercase tracking-wider rounded bg-green-200 dark:bg-green-900 text-green-900 dark:text-green-100">
                  Resolved
                </span>
              )}
              <span className="text-xs text-gray-500 font-medium tabular-nums">
                {new Date(entry.occurredAt).toLocaleString()}
              </span>
            </div>
            {detail && (
              <p className="mt-1 text-xs font-mono break-words text-gray-700 dark:text-gray-300">
                {detail}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
