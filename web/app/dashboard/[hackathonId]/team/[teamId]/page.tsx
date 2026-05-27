"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  deviceId: string | null;
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

interface Member {
  deviceId: string;
  slot: number;
  memberName: string;
}

interface AppUsageRow {
  deviceId: string | null;
  appPackage: string;
  appLabel: string | null;
  foregroundMinutes: number;
}

interface DeviceCount {
  deviceId: string | null;
  count: number;
}

import Image from "next/image";

const ALL_DEVICES = "__all__";

export default function TeamDetailPage() {
  const params = useParams();
  const hackathonId = params.hackathonId as string;
  const teamId = params.teamId as string;

  const [members, setMembers] = useState<Member[]>([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [vitals, setVitals] = useState<(VitalsEntry & { deviceId: string | null })[]>([]);
  const [sensors, setSensors] = useState<(SensorEntry & { deviceId: string | null })[]>([]);
  const [crashes, setCrashes] = useState<(CrashLogEntry & { deviceId: string | null })[]>([]);
  const [tamper, setTamper] = useState<(TamperEntry & { deviceId: string | null })[]>([]);
  const [appUsage, setAppUsage] = useState<AppUsageRow[]>([]);
  const [cameraByDevice, setCameraByDevice] = useState<DeviceCount[]>([]);
  const [clipboardByDevice, setClipboardByDevice] = useState<DeviceCount[]>([]);
  const [screenshots, setScreenshots] = useState<ScreenshotEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "screenshots" | "crashes" | "tamper">("overview");
  const [selectedDevice, setSelectedDevice] = useState<string>(ALL_DEVICES);

  // Deep-link from the team-card ⚠ badge (?tab=tamper).
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

        // All seven endpoints now return { members, rows: [...] } (event-counts
        // returns { members, cameraByDevice, clipboardByDevice, ... }).
        // Members list is identical across endpoints — we take it from
        // whichever responded first.
        let nextMembers: Member[] | null = null;
        const accept = (m: Member[] | undefined) => {
          if (!nextMembers && m) nextMembers = m;
        };

        if (timelineRes.ok) {
          const j = await timelineRes.json();
          accept(j.members);
          setTimeline(j.rows ?? []);
        }
        if (vitalsRes.ok) {
          const j = await vitalsRes.json();
          accept(j.members);
          setVitals(j.rows ?? []);
        }
        if (sensorsRes.ok) {
          const j = await sensorsRes.json();
          accept(j.members);
          setSensors(j.rows ?? []);
        }
        if (crashesRes.ok) {
          const j = await crashesRes.json();
          accept(j.members);
          setCrashes(j.rows ?? []);
        }
        if (appUsageRes.ok) {
          const j = await appUsageRes.json();
          accept(j.members);
          setAppUsage(j.rows ?? []);
        }
        if (eventCountsRes.ok) {
          const j = await eventCountsRes.json();
          accept(j.members);
          setCameraByDevice(j.cameraByDevice ?? []);
          setClipboardByDevice(j.clipboardByDevice ?? []);
        }
        if (tamperRes.ok) {
          const j = await tamperRes.json();
          accept(j.members);
          setTamper(j.rows ?? []);
        }

        if (nextMembers) setMembers(nextMembers);
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

  // deviceId -> "Member N: Name" for chips on Tamper / Crash rows.
  const memberLabelByDevice = useMemo(() => {
    const m = new Map<string, string>();
    for (const mem of members) {
      m.set(mem.deviceId, `Member ${mem.slot}: ${mem.memberName}`);
    }
    return m;
  }, [members]);

  const labelFor = useCallback(
    (deviceId: string | null | undefined) =>
      deviceId ? memberLabelByDevice.get(deviceId) ?? null : null,
    [memberLabelByDevice]
  );

  const matchDevice = useCallback(
    (deviceId: string | null | undefined) => {
      if (selectedDevice === ALL_DEVICES) return true;
      return deviceId === selectedDevice;
    },
    [selectedDevice]
  );

  const filteredTimeline = useMemo(
    () => timeline.filter((e) => matchDevice(e.deviceId)),
    [timeline, matchDevice]
  );
  // On TEAM tab with multiple phones the Vitals chart line zigzags between
  // devices (e.g. iQOO at 56% battery and emulator at 100% on the same axis).
  // Collapse vitals to a single device for readability — preferring slot 1,
  // but falling back to the first member that actually has data. Sensors are
  // NOT collapsed: the SensorPanels render per-row stats that don't suffer
  // from interleaving, and collapsing was hiding rows when slot 1 happened
  // to have no sensor batches yet.
  const primaryDeviceIdForVitals = useMemo(() => {
    if (selectedDevice !== ALL_DEVICES) return selectedDevice;
    if (members.length === 0) return null;
    const sorted = [...members].sort((a, b) => a.slot - b.slot);
    const withData = sorted.find((m) =>
      vitals.some((v) => v.deviceId === m.deviceId)
    );
    return (withData ?? sorted[0]).deviceId;
  }, [selectedDevice, members, vitals]);

  const vitalsCollapsedToPrimary =
    selectedDevice === ALL_DEVICES && members.length > 1;

  const filteredVitals = useMemo(
    () =>
      vitalsCollapsedToPrimary
        ? vitals.filter((v) => v.deviceId === primaryDeviceIdForVitals)
        : vitals.filter((v) => matchDevice(v.deviceId)),
    [vitals, matchDevice, vitalsCollapsedToPrimary, primaryDeviceIdForVitals]
  );
  const filteredSensors = useMemo(
    () => sensors.filter((s) => matchDevice(s.deviceId)),
    [sensors, matchDevice]
  );

  // Name of the member whose data is currently driving the Vitals chart —
  // only used for the banner that explains the collapse.
  const primaryMemberLabel = useMemo(() => {
    if (!vitalsCollapsedToPrimary || !primaryDeviceIdForVitals) return null;
    const m = members.find((mm) => mm.deviceId === primaryDeviceIdForVitals);
    return m ? `Member ${m.slot}: ${m.memberName}` : null;
  }, [vitalsCollapsedToPrimary, primaryDeviceIdForVitals, members]);
  const filteredAppUsage = useMemo(() => {
    if (selectedDevice === ALL_DEVICES) {
      // Collapse the per-(device, package) rows into per-package totals.
      const out = new Map<string, AppUsageRow>();
      for (const row of appUsage) {
        const existing = out.get(row.appPackage);
        if (existing) {
          existing.foregroundMinutes += row.foregroundMinutes;
          existing.appLabel = existing.appLabel ?? row.appLabel;
        } else {
          out.set(row.appPackage, { ...row, deviceId: null });
        }
      }
      return Array.from(out.values()).sort(
        (a, b) => b.foregroundMinutes - a.foregroundMinutes
      );
    }
    return appUsage.filter((r) => matchDevice(r.deviceId));
  }, [appUsage, matchDevice, selectedDevice]);
  const filteredCameraOpens = useMemo(() => {
    if (selectedDevice === ALL_DEVICES)
      return cameraByDevice.reduce((s, r) => s + r.count, 0);
    return cameraByDevice
      .filter((r) => r.deviceId === selectedDevice)
      .reduce((s, r) => s + r.count, 0);
  }, [cameraByDevice, selectedDevice]);
  const filteredClipboardEvents = useMemo(() => {
    if (selectedDevice === ALL_DEVICES)
      return clipboardByDevice.reduce((s, r) => s + r.count, 0);
    return clipboardByDevice
      .filter((r) => r.deviceId === selectedDevice)
      .reduce((s, r) => s + r.count, 0);
  }, [clipboardByDevice, selectedDevice]);
  const filteredCrashes = useMemo(
    () =>
      crashes
        .filter((c) => matchDevice(c.deviceId))
        .map((c) => ({ ...c, memberLabel: labelFor(c.deviceId) })),
    [crashes, matchDevice, labelFor]
  );
  const filteredTamper = useMemo(
    () =>
      tamper
        .filter((t) => matchDevice(t.deviceId))
        .map((t) => ({ ...t, memberLabel: labelFor(t.deviceId) })),
    [tamper, matchDevice, labelFor]
  );

  const totals = filteredTimeline.reduce(
    (acc, entry) => ({
      total_taps: acc.total_taps + (entry.taps ?? 0),
      total_text_inputs: acc.total_text_inputs + (entry.textInputs ?? 0),
      total_scrolls: acc.total_scrolls + (entry.scrolls ?? 0),
      total_app_switches: acc.total_app_switches + (entry.appSwitches ?? 0),
      total_keyboard_seconds:
        acc.total_keyboard_seconds + (entry.keyboardActiveSeconds ?? 0),
      total_office_kit_seconds:
        acc.total_office_kit_seconds + (entry.officeKitSeconds ?? 0),
    }),
    {
      total_taps: 0,
      total_text_inputs: 0,
      total_scrolls: 0,
      total_app_switches: 0,
      total_keyboard_seconds: 0,
      total_office_kit_seconds: 0,
    }
  );

  // Fallback per-app minutes when UsageStats isn't populating (no permission).
  const fallbackAppMinutes = new Map<string, number>();
  for (const entry of filteredTimeline) {
    if (entry.foregroundApp) {
      fallbackAppMinutes.set(
        entry.foregroundApp,
        (fallbackAppMinutes.get(entry.foregroundApp) ?? 0) + 1
      );
    }
  }
  const appUsageData =
    filteredAppUsage.length > 0
      ? filteredAppUsage
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
        {/* Member tab strip: Team | Member 1: Name | Member 2: Name ... */}
        {members.length > 0 && (
          <div className="flex items-center gap-2 bg-black/5 dark:bg-white/5 p-1.5 rounded-2xl overflow-x-auto">
            <button
              type="button"
              onClick={() => setSelectedDevice(ALL_DEVICES)}
              className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all duration-300 whitespace-nowrap ${
                selectedDevice === ALL_DEVICES
                  ? "bg-primary text-black shadow-lg shadow-primary/20"
                  : "text-gray-500 hover:text-black dark:hover:text-primary"
              }`}
            >
              Team ({members.length})
            </button>
            {members.map((m) => (
              <button
                key={m.deviceId}
                type="button"
                onClick={() => setSelectedDevice(m.deviceId)}
                className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all duration-300 whitespace-nowrap ${
                  selectedDevice === m.deviceId
                    ? "bg-primary text-black shadow-lg shadow-primary/20"
                    : "text-gray-500 hover:text-black dark:hover:text-primary"
                }`}
              >
                Member {m.slot}: {m.memberName}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 bg-black/5 dark:bg-white/5 p-1.5 rounded-2xl w-fit">
          {(
            [
              ["overview", "Overview"],
              ["screenshots", `Screenshots${screenshots.length > 0 ? ` (${screenshots.length})` : ""}`],
              ["crashes", `Crash log${filteredCrashes.length > 0 ? ` (${filteredCrashes.length})` : ""}`],
              ["tamper", `Tamper${filteredTamper.length > 0 ? ` (${filteredTamper.length})` : ""}`],
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
                total_camera_opens: filteredCameraOpens,
                total_clipboard_events: filteredClipboardEvents,
              }}
            />

            <div className="space-y-12">
              <section>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">Activity Timeline</h2>
                  <span className="h-px flex-1 bg-black/5 dark:bg-white/5 ml-4"></span>
                </div>
                <div className="bg-white dark:bg-white/5 rounded-[2rem] border border-black/5 dark:border-white/5 p-8 shadow-2xl">
                  <TapTimelineChart data={filteredTimeline} />
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
              <SensorPanels data={filteredSensors} />
            </section>

            <section>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">Device Vitals</h2>
                <span className="h-px flex-1 bg-black/5 dark:bg-white/5 ml-4"></span>
              </div>
              {primaryMemberLabel && (
                <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-primary/90">
                  Showing vitals for {primaryMemberLabel}. Switch to another member's tab above to see their device.
                </div>
              )}
              <div className="bg-white dark:bg-white/5 rounded-3xl border border-black/5 dark:border-white/5 p-6 shadow-xl">
                <VitalsChart data={filteredVitals} />
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
              deviceId={
                selectedDevice && selectedDevice !== ALL_DEVICES
                  ? selectedDevice
                  : undefined
              }
            />
          </section>
        )}

        {tab === "crashes" && (
          <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">Crash log</h2>
              <span className="h-px flex-1 bg-black/5 dark:bg-white/5 ml-4"></span>
            </div>
            <CrashLogList entries={filteredCrashes} />
          </section>
        )}

        {tab === "tamper" && (
          <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">Tamper events</h2>
              <span className="h-px flex-1 bg-black/5 dark:bg-white/5 ml-4"></span>
            </div>
            <TamperList entries={filteredTamper} />
          </section>
        )}
      </main>
    </div>
  );
}
