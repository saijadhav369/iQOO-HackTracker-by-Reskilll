"use client";

import Link from "next/link";

export interface OrganiserAlert {
  id: number;
  hackathonId: string;
  teamId: string;
  teamName: string;
  type: string;
  message: string;
  createdAt: string;
}

interface AlertTrayProps {
  hackathonId: string;
  alerts: OrganiserAlert[];
  onDismiss: (id: number) => void;
}

function ageLabel(createdAt: string): string {
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return "";
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export default function AlertTray({ hackathonId, alerts, onDismiss }: AlertTrayProps) {
  if (alerts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex w-80 flex-col gap-3">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className="group rounded-2xl border-2 border-primary bg-black text-white shadow-2xl shadow-primary/20 animate-in slide-in-from-right-8 duration-300 overflow-hidden"
        >
          <div className="flex items-start gap-4 p-4 relative">
            <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
            <div className="mt-1 h-2 w-2 flex-none rounded-full bg-primary shadow-[0_0_8px_#fbb201] animate-pulse" />
            <div className="flex-1 min-w-0">
              <Link
                href={`/dashboard/${hackathonId}/team/${alert.teamId}`}
                className="block hover:text-primary transition-colors"
              >
                <p className="text-[10px] font-black uppercase tracking-widest text-primary">
                  {alert.teamName}
                </p>
                <p className="mt-1 text-xs font-bold leading-tight uppercase tracking-tight">
                  {alert.message}
                </p>
                <p className="mt-2 text-[9px] text-white/40 font-black uppercase tracking-widest">
                  {ageLabel(alert.createdAt)}
                </p>
              </Link>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                onDismiss(alert.id);
              }}
              aria-label="Dismiss"
              className="flex-none h-6 w-6 rounded-lg flex items-center justify-center bg-white/5 hover:bg-primary hover:text-black transition-all"
            >
              <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M2 2l10 10M12 2L2 12" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
