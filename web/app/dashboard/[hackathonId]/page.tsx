"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import LiveGrid from "@/components/live-grid";
import LightToggle from "@/components/light-toggle";
import NotifyModal from "@/components/notify-modal";
import AlertTray, { OrganiserAlert } from "@/components/alert-tray";
import ExportButton from "@/components/export-button";

const ALERT_POLL_MS = 5_000;
// Polling-cron: Railway doesn't give us cron, so the dashboard pings the idle
// scanner once a minute while it's open. Future deploy → Vercel Cron.
const SCAN_IDLE_INTERVAL_MS = 60_000;

import Image from "next/image";

export default function DashboardPage() {
  const params = useParams();
  const hackathonId = params.hackathonId as string;
  const [showNotify, setShowNotify] = useState(false);
  const [alerts, setAlerts] = useState<OrganiserAlert[]>([]);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/organiser-alerts?hackathonId=${encodeURIComponent(hackathonId)}`,
        { cache: "no-store" }
      );
      if (res.ok) setAlerts(await res.json());
    } catch {
      // ignore — next tick retries
    }
  }, [hackathonId]);

  useEffect(() => {
    fetchAlerts();
    const t = setInterval(fetchAlerts, ALERT_POLL_MS);
    return () => clearInterval(t);
  }, [fetchAlerts]);

  // Polling cron — replace with Vercel Cron when we leave Railway.
  useEffect(() => {
    const ping = () => {
      fetch(`/api/hackathon/${hackathonId}/scan-idle`, {
        method: "POST",
        cache: "no-store",
      })
        .then(() => fetchAlerts())
        .catch(() => {});
    };
    ping();
    const t = setInterval(ping, SCAN_IDLE_INTERVAL_MS);
    return () => clearInterval(t);
  }, [hackathonId, fetchAlerts]);

  const idleWarningTeamIds = useMemo(() => {
    const s = new Set<string>();
    for (const a of alerts) {
      if (a.type === "idle_warning") s.add(a.teamId);
    }
    return s;
  }, [alerts]);

  const dismissAlert = useCallback(
    async (id: number) => {
      setAlerts((prev) => prev.filter((a) => a.id !== id));
      try {
        await fetch(`/api/organiser-alerts/${id}`, {
          method: "PATCH",
          cache: "no-store",
        });
      } catch {
        // optimistic — next poll will reconcile if the server rejected
        fetchAlerts();
      }
    },
    [fetchAlerts]
  );

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#050505]">
      <header className="sticky top-0 z-40 border-b border-black/5 dark:border-primary/20 bg-white/80 dark:bg-black/80 backdrop-blur-md px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/HackTracker.png"
              alt="Logo"
              width={40}
              height={40}
              className="rounded-lg shadow-lg shadow-primary/10"
            />
            <div>
              <h1 className="text-xl font-black uppercase tracking-tighter leading-none">HackTracker</h1>
              <p className="text-[10px] text-primary font-black uppercase tracking-widest mt-1 opacity-80">{hackathonId}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <LightToggle hackathonId={hackathonId} />
            <button
              onClick={() => setShowNotify(true)}
              className="px-4 py-2 text-xs font-black uppercase tracking-widest rounded-lg bg-primary text-black hover:brightness-110 transition shadow-lg shadow-primary/10 active:scale-95"
            >
              Notify
            </button>
            <a
              href={`/dashboard/${hackathonId}/leaderboard`}
              className="px-4 py-2 text-xs font-black uppercase tracking-widest rounded-lg bg-black text-white dark:bg-white/10 dark:text-white border border-transparent hover:border-primary/50 transition active:scale-95"
            >
              Leaderboard
            </a>
            <a
              href={`/dashboard/${hackathonId}/manage`}
              className="px-4 py-2 text-xs font-black uppercase tracking-widest rounded-lg border border-black/10 dark:border-white/10 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition active:scale-95"
            >
              Manage
            </a>
            <a
              href={`/dashboard/${hackathonId}/teams`}
              className="px-4 py-2 text-xs font-black uppercase tracking-widest rounded-lg border border-black/10 dark:border-white/10 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition active:scale-95"
            >
              Teams
            </a>
            <a
              href={`/dashboard/${hackathonId}/registrations`}
              className="px-4 py-2 text-xs font-black uppercase tracking-widest rounded-lg border border-black/10 dark:border-white/10 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition active:scale-95"
            >
              Registrations
            </a>
            <ExportButton scope="hackathon" hackathonId={hackathonId} />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <LiveGrid hackathonId={hackathonId} idleWarningTeamIds={idleWarningTeamIds} />
      </main>

      <AlertTray hackathonId={hackathonId} alerts={alerts} onDismiss={dismissAlert} />

      {showNotify && (
        <NotifyModal
          hackathonId={hackathonId}
          onClose={() => setShowNotify(false)}
        />
      )}
    </div>
  );
}
