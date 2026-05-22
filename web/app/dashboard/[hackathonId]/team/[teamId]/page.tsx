"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import TapTimelineChart from "@/components/tap-timeline-chart";
import AppUsagePie from "@/components/app-usage-pie";
import VitalsChart, { VitalsEntry } from "@/components/vitals-chart";
import SensorPanels, { SensorEntry } from "@/components/sensor-panels";
import StatsSummary from "@/components/stats-summary";
import CrashLogList, { CrashLogEntry } from "@/components/crash-log-list";
import ScreenshotPanel, { ScreenshotEntry } from "@/components/screenshot-panel";
import TamperList, { TamperEntry } from "@/components/tamper-list";
import ExportButton from "@/components/export-button";
import Link from "next/link";

interface TimelineEntry {
  periodStart: string;
  periodEnd: string;
  taps: number | null;
  textInputs: number | null;
  scrolls: number | null;
  appSwitches: number | null;
  keyboardActiveSeconds: number | null;
  officeKitSeconds: number | null;
  foregroundApp: string | null;
  perAppTaps: Record<string, number> | null;
}


import Image from "next/image";

export default function TeamDetailPage() {
  const params = useParams();
  const hackathonId = params.hackathonId as string;
  const teamId = params.teamId as string;

  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [vitals, setVitals] = useState<VitalsEntry[]>([]);
  const [sensors, setSensors] = useState<SensorEntry[]>([]);
  const [crashes, setCrashes] = useState<CrashLogEntry[]>([]);
  const [tamper, setTamper] = useState<TamperEntry[]>([]);
  const [appUsage, setAppUsage] = useState<
    { appPackage: string; appLabel: string | null; foregroundMinutes: number }[]
  >([]);
  const [eventCounts, setEventCounts] = useState<{
    cameraOpens: number;
    clipboardEvents: number;
  }>({ cameraOpens: 0, clipboardEvents: 0 });
  const [screenshots, setScreenshots] = useState<ScreenshotEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "screenshots" | "crashes" | "tamper">("overview");

  // Deep-link from the team-card ⚠ badge (?tab=tamper). Read on the client only
  // to avoid the useSearchParams static-build Suspense requirement.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "tamper" || t === "screenshots" || t === "crashes") setTab(t);
  }, []);

  const fetchScreenshots = useCallback(async () => {
    try {
      const res = await fetch(`/api/team/${teamId}/screenshots`, { cache: "no-store" });
      if (res.ok) setScreenshots(await res.json());
    } catch {}
  }, [teamId]);

  // Track whether any row is still pending so we can fast-poll only when it
  // matters (cuts dashboard-side latency for new captures from ~10s to ~2s
  // without 5×-ing the load on timeline/vitals/sensors/crashes).
  const hasPending = screenshots.some((s) => s.status !== "captured");

  useEffect(() => {
    async function fetchData() {
      try {
        const [
          timelineRes,
          vitalsRes,
          sensorsRes,
          crashesRes,
          appUsageRes,
          eventCountsRes,
          tamperRes,
        ] = await Promise.all([
          fetch(`/api/team/${teamId}/timeline`, { cache: "no-store" }),
          fetch(`/api/team/${teamId}/vitals`, { cache: "no-store" }),
          fetch(`/api/team/${teamId}/sensors`, { cache: "no-store" }),
          fetch(`/api/team/${teamId}/crashes`, { cache: "no-store" }),
          fetch(`/api/team/${teamId}/app-usage`, { cache: "no-store" }),
          fetch(`/api/team/${teamId}/event-counts`, { cache: "no-store" }),
          fetch(`/api/team/${teamId}/tamper`, { cache: "no-store" }),
        ]);
        if (timelineRes.ok) setTimeline(await timelineRes.json());
        if (vitalsRes.ok) setVitals(await vitalsRes.json());
        if (sensorsRes.ok) setSensors(await sensorsRes.json());
        if (crashesRes.ok) setCrashes(await crashesRes.json());
        if (appUsageRes.ok) setAppUsage(await appUsageRes.json());
        if (eventCountsRes.ok) setEventCounts(await eventCountsRes.json());
        if (tamperRes.ok) setTamper(await tamperRes.json());
      } catch {}
      setLoading(false);
    }

    fetchData();
    fetchScreenshots();
    const slowInterval = setInterval(() => {
      fetchData();
      fetchScreenshots();
    }, 10000);
    const screenshotInterval = hasPending
      ? setInterval(fetchScreenshots, 2000)
      : null;
    return () => {
      clearInterval(slowInterval);
      if (screenshotInterval) clearInterval(screenshotInterval);
    };
  }, [hackathonId, teamId, fetchScreenshots, hasPending]);

  const totals = timeline.reduce(
    (acc, entry) => ({
      total_taps: acc.total_taps + (entry.taps ?? 0),
      total_text_inputs: acc.total_text_inputs + (entry.textInputs ?? 0),
      total_scrolls: acc.total_scrolls + (entry.scrolls ?? 0),
      total_app_switches: acc.total_app_switches + (entry.appSwitches ?? 0),
      total_keyboard_seconds: acc.total_keyboard_seconds + (entry.keyboardActiveSeconds ?? 0),
      total_office_kit_seconds: acc.total_office_kit_seconds + (entry.officeKitSeconds ?? 0),
    }),
    { total_taps: 0, total_text_inputs: 0, total_scrolls: 0, total_app_switches: 0, total_keyboard_seconds: 0, total_office_kit_seconds: 0 }
  );

  // Real per-app foreground minutes from the UsageStats snapshots (app_usage).
  // Falls back to the coarse foregroundApp-per-batch sampling if UsageStats
  // hasn't populated yet (e.g. Usage Access not granted).
  const fallbackAppMinutes = new Map<string, number>();
  for (const entry of timeline) {
    if (entry.foregroundApp) {
      fallbackAppMinutes.set(
        entry.foregroundApp,
        (fallbackAppMinutes.get(entry.foregroundApp) ?? 0) + 1
      );
    }
  }
  const appUsageData =
    appUsage.length > 0
      ? appUsage
      : Array.from(fallbackAppMinutes.entries())
          .map(([pkg, minutes]) => ({
            appPackage: pkg,
            appLabel: null,
            foregroundMinutes: minutes,
          }))
          .sort((a, b) => b.foregroundMinutes - a.foregroundMinutes);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen font-bold text-gray-500">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#050505]">
      <header className="sticky top-0 z-40 border-b border-black/5 dark:border-primary/20 bg-white/80 dark:bg-black/80 backdrop-blur-md px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href={`/dashboard/${hackathonId}`}
              className="flex items-center justify-center h-10 w-10 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-primary hover:text-black transition-all group"
            >
              <span className="group-hover:-translate-x-0.5 transition-transform font-black">&larr;</span>
            </Link>
            <div className="flex items-center gap-3">
              <Image
                src="/HackTracker.png"
                alt="Logo"
                width={40}
                height={40}
                className="rounded-lg"
              />
              <div>
                <h1 className="text-xl font-black uppercase tracking-tighter leading-none">{teamId}</h1>
                <p className="text-[10px] text-primary font-black uppercase tracking-widest mt-1 opacity-80">{hackathonId}</p>
              </div>
            </div>
          </div>
          <ExportButton scope="team" hackathonId={hackathonId} teamId={teamId} />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10 space-y-12">
        <div className="flex items-center gap-2 bg-black/5 dark:bg-white/5 p-1.5 rounded-2xl w-fit">
          {(
            [
              ["overview", "Overview"],
              ["screenshots", `Screenshots${screenshots.length > 0 ? ` (${screenshots.length})` : ""}`],
              ["crashes", `Crash log${crashes.length > 0 ? ` (${crashes.length})` : ""}`],
              ["tamper", `Tamper${tamper.length > 0 ? ` (${tamper.length})` : ""}`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all duration-300 ${
                tab === key
                  ? "bg-primary text-black shadow-lg shadow-primary/20"
                  : "text-gray-500 hover:text-black dark:hover:text-primary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <StatsSummary
              stats={{
                ...totals,
                total_office_kit_minutes: Math.round(
                  totals.total_office_kit_seconds / 60
                ),
                total_camera_opens: eventCounts.cameraOpens,
                total_clipboard_events: eventCounts.clipboardEvents,
              }}
            />

            <div className="space-y-12">
              <section>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">Activity Timeline</h2>
                  <span className="h-px flex-1 bg-black/5 dark:bg-white/5 ml-4"></span>
                </div>
                <div className="bg-white dark:bg-white/5 rounded-[2rem] border border-black/5 dark:border-white/5 p-8 shadow-2xl">
                  <TapTimelineChart data={timeline} />
                </div>
              </section>

              <section>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">App Usage Analysis</h2>
                  <span className="h-px flex-1 bg-black/5 dark:bg-white/5 ml-4"></span>
                </div>
                <div className="bg-white dark:bg-white/5 rounded-[2rem] border border-black/5 dark:border-white/5 p-8 shadow-2xl">
                  <AppUsagePie data={appUsageData} />
                </div>
              </section>
            </div>

            <section>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">Sensors</h2>
                <span className="h-px flex-1 bg-black/5 dark:bg-white/5 ml-4"></span>
              </div>
              <SensorPanels data={sensors} />
            </section>

            <section>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">Device Vitals</h2>
                <span className="h-px flex-1 bg-black/5 dark:bg-white/5 ml-4"></span>
              </div>
              <div className="bg-white dark:bg-white/5 rounded-3xl border border-black/5 dark:border-white/5 p-6 shadow-xl">
                <VitalsChart data={vitals} />
              </div>
            </section>
          </div>
        )}

        {tab === "screenshots" && (
          <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <ScreenshotPanel
              teamId={teamId}
              screenshots={screenshots}
              onRefresh={fetchScreenshots}
            />
          </section>
        )}

        {tab === "crashes" && (
          <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">Crash log</h2>
              <span className="h-px flex-1 bg-black/5 dark:bg-white/5 ml-4"></span>
            </div>
            <CrashLogList entries={crashes} />
          </section>
        )}

        {tab === "tamper" && (
          <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">Tamper events</h2>
              <span className="h-px flex-1 bg-black/5 dark:bg-white/5 ml-4"></span>
            </div>
            <TamperList entries={tamper} />
          </section>
        )}
      </main>
    </div>
  );
}
