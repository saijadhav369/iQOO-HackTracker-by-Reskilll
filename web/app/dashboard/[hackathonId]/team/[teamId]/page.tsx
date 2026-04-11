"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import TapTimelineChart from "@/components/tap-timeline-chart";
import AppUsagePie from "@/components/app-usage-pie";
import VitalsChart from "@/components/vitals-chart";
import StatsSummary from "@/components/stats-summary";
import Link from "next/link";

interface TimelineEntry {
  periodStart: string;
  periodEnd: string;
  taps: number | null;
  textInputs: number | null;
  scrolls: number | null;
  appSwitches: number | null;
  foregroundApp: string | null;
  perAppTaps: Record<string, number> | null;
}

export default function TeamDetailPage() {
  const params = useParams();
  const hackathonId = params.hackathonId as string;
  const teamId = params.teamId as string;

  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [vitals, setVitals] = useState<Array<{ recordedAt: string; batteryLevel: number | null; temperature: number | null; cpuUsage: number | null }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [timelineRes, vitalsRes] = await Promise.all([
          fetch(`/api/team/${teamId}/timeline`, { cache: "no-store" }),
          fetch(`/api/team/${teamId}/vitals`, { cache: "no-store" }),
        ]);
        if (timelineRes.ok) setTimeline(await timelineRes.json());
        if (vitalsRes.ok) setVitals(await vitalsRes.json());
      } catch {}
      setLoading(false);
    }

    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [hackathonId, teamId]);

  const totals = timeline.reduce(
    (acc, entry) => ({
      total_taps: acc.total_taps + (entry.taps ?? 0),
      total_text_inputs: acc.total_text_inputs + (entry.textInputs ?? 0),
      total_scrolls: acc.total_scrolls + (entry.scrolls ?? 0),
      total_app_switches: acc.total_app_switches + (entry.appSwitches ?? 0),
    }),
    { total_taps: 0, total_text_inputs: 0, total_scrolls: 0, total_app_switches: 0 }
  );

  const appMinutes = new Map<string, number>();
  for (const entry of timeline) {
    if (entry.foregroundApp) {
      appMinutes.set(entry.foregroundApp, (appMinutes.get(entry.foregroundApp) ?? 0) + 1);
    }
  }

  const appUsageData = Array.from(appMinutes.entries())
    .map(([pkg, minutes]) => ({ appPackage: pkg, appLabel: null, foregroundMinutes: minutes }))
    .sort((a, b) => b.foregroundMinutes - a.foregroundMinutes);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen font-bold text-gray-500">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <header className="border-b-2 border-black dark:border-white px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <Link href={`/dashboard/${hackathonId}`} className="text-gray-500 hover:text-black dark:hover:text-white transition font-bold">
            &larr; Back
          </Link>
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tight">{teamId}</h1>
            <p className="text-sm text-gray-500 font-medium">{hackathonId}</p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <StatsSummary stats={totals} />

        <section>
          <h2 className="text-lg font-black uppercase tracking-tight mb-4">Tap Timeline</h2>
          <div className="bg-white dark:bg-black rounded-xl border-2 border-black dark:border-white p-4">
            <TapTimelineChart data={timeline} />
          </div>
        </section>

        <section>
          <h2 className="text-lg font-black uppercase tracking-tight mb-4">App Usage</h2>
          <div className="bg-white dark:bg-black rounded-xl border-2 border-black dark:border-white p-4">
            <AppUsagePie data={appUsageData} />
          </div>
        </section>

        <section>
          <h2 className="text-lg font-black uppercase tracking-tight mb-4">Device Vitals</h2>
          <div className="bg-white dark:bg-black rounded-xl border-2 border-black dark:border-white p-4">
            <VitalsChart data={vitals} />
          </div>
        </section>
      </main>
    </div>
  );
}
