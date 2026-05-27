"use client";

import { useState } from "react";

export interface CrashLogEntry {
  id: number;
  occurredAt: string;
  threadName: string | null;
  stacktrace: string | null;
  foregroundApp: string | null;
  reason: string | null;
  memberLabel?: string | null;
}

function reasonBadge(reason: string | null): { label: string; cls: string } {
  if (reason === "recovered_dirty") {
    return {
      label: "Dirty Exit",
      cls: "bg-primary/10 text-primary border border-primary/20",
    };
  }
  if (reason === "uncaught_exception") {
    return {
      label: "Crash",
      cls: "bg-red-500/10 text-red-500 border border-red-500/20",
    };
  }
  return {
    label: reason ?? "Unknown",
    cls: "bg-white/5 text-gray-400 border border-white/10",
  };
}

function CrashRow({ entry }: { entry: CrashLogEntry }) {
  const [open, setOpen] = useState(false);
  const badge = reasonBadge(entry.reason);
  const occurred = new Date(entry.occurredAt);

  return (
    <div className={`rounded-2xl border transition-all duration-300 ${
      open ? "border-primary bg-black/40 shadow-xl" : "border-black/5 dark:border-white/5 bg-white dark:bg-white/5 hover:border-white/20"
    }`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-4 px-6 py-4 text-left group"
      >
        <div className="flex flex-col gap-2 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <span
              className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-lg ${badge.cls}`}
            >
              {badge.label}
            </span>
            {entry.memberLabel && (
              <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-widest rounded-md bg-primary/10 text-primary border border-primary/20">
                {entry.memberLabel}
              </span>
            )}
            {entry.threadName && (
              <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest opacity-60">
                {entry.threadName}
              </span>
            )}
          </div>
          <span className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] tabular-nums opacity-40">
            {occurred.toLocaleString()}
          </span>
        </div>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center bg-black/5 dark:bg-white/5 transition-transform duration-300 ${open ? 'rotate-180 bg-primary text-black' : 'group-hover:bg-primary/10 group-hover:text-primary'}`}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {open && (
        <pre className="border-t border-black/5 dark:border-white/5 px-6 py-5 text-[10px] font-mono whitespace-pre-wrap break-words text-gray-400 bg-black/20 max-h-96 overflow-auto">
          {entry.stacktrace?.trim() || "(no stacktrace)"}
        </pre>
      )}
    </div>
  );
}

export default function CrashLogList({ entries }: { entries: CrashLogEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="rounded-3xl border border-black/5 dark:border-white/5 bg-white dark:bg-white/5 p-12 text-center">
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 opacity-40">No system crashes detected</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {entries.map((entry) => (
        <CrashRow key={entry.id} entry={entry} />
      ))}
    </div>
  );
}
