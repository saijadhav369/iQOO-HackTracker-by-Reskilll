// Gathers everything we know about a team (or every team in a hackathon) into
// a single in-memory bundle ready for the PDF/XLSX renderers. All DB work
// lives here; renderers stay pure functions of the bundle.
//
// Design notes:
//  * The hackathon path issues ONE query per table scoped by hackathonId, then
//    groups by teamId in memory — far cheaper than N team-scoped queries.
//  * The team path scopes by teamId directly. The per-team assembly helper is
//    shared between both paths.
//  * `deriveVitalsPerTeam` is duplicated here from
//    `app/api/hackathon/[id]/leaderboard/route.ts` to avoid expanding the
//    refactor surface of this PR. They MUST stay in sync if scoring changes.
//  * Screenshot byte fetches use `mapWithConcurrency(4)` — Neon's HTTP driver
//    is per-statement (no pool to exhaust) but we cap to be polite.

import { db } from "@/lib/db";
import {
  hackathons,
  teams,
  eventBatches,
  appUsage,
  deviceVitals,
  sensorAggregates,
  crashLogs,
  tamperEvents,
  cameraEvents,
  clipboardEvents,
  heartbeats,
  screenshotRequests,
  lightTransitions,
  notifications,
  organiserAlerts,
} from "@/lib/db/schema";
import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import {
  computeBuildScores,
  type ScoringConfig,
  type TeamRawMetrics,
} from "@/lib/scoring";
import { computeLongestSessionMsPerTeam } from "@/lib/sessions";
import { fetchScreenshotBytes } from "@/lib/export/screenshots";
import type {
  HackathonBundle,
  ScreenshotPayload,
  TeamBundle,
  TimelineRow,
  VitalsRow,
  SensorRow,
  CrashRow,
  TamperRow,
  AppUsageRow,
  BundleHackathon,
  LightTransitionRow,
  NotificationRow,
} from "@/lib/export/types";

export const MAX_SCREENSHOTS_PER_TEAM = 20;

// Mirror of the constants in app/api/hackathon/[id]/leaderboard/route.ts.
const COMPILE_SPIKE_DELTA = 50;
const THERMAL_STATUS_SEVERE = 4;

interface VitalRow {
  teamId: string;
  recordedAt: Date | null;
  cpuUsage: number | null;
  batteryLevel: number | null;
  thermalHeadroom: number | null;
  thermalStatus: number | null;
  monsterMode: boolean | null;
}

interface VitalsDerived {
  compileSpikes: number;
  batteryDrainRate: number;
  thermalHeadroom: number;
  hardwareRedline: number;
  monsterModeMinutes: number;
}

// Duplicated from leaderboard route — see file header comment.
function deriveVitalsPerTeam(rows: VitalRow[]): Map<string, VitalsDerived> {
  const out = new Map<string, VitalsDerived>();
  let team: string | null = null;
  let prevCpu: number | null = null;
  let prevBattery: number | null = null;
  let firstTs = 0;
  let lastTs = 0;
  let spikes = 0;
  let drained = 0;
  let maxHeadroom = 0;
  let redline = 0;
  const monsterMinutes = new Set<number>();

  const flush = () => {
    if (team === null) return;
    const hours = lastTs > firstTs ? (lastTs - firstTs) / 3_600_000 : 0;
    out.set(team, {
      compileSpikes: spikes,
      batteryDrainRate: hours > 0 ? drained / hours : 0,
      thermalHeadroom: maxHeadroom,
      hardwareRedline: redline,
      monsterModeMinutes: monsterMinutes.size,
    });
  };

  for (const r of rows) {
    if (r.teamId !== team) {
      flush();
      team = r.teamId;
      prevCpu = null;
      prevBattery = null;
      firstTs = r.recordedAt ? new Date(r.recordedAt).getTime() : 0;
      lastTs = firstTs;
      spikes = 0;
      drained = 0;
      maxHeadroom = 0;
      redline = 0;
      monsterMinutes.clear();
    }
    const ts = r.recordedAt ? new Date(r.recordedAt).getTime() : 0;
    if (ts) lastTs = ts;
    if (r.cpuUsage != null) {
      if (prevCpu != null && r.cpuUsage - prevCpu > COMPILE_SPIKE_DELTA) spikes++;
      prevCpu = r.cpuUsage;
    }
    if (r.batteryLevel != null) {
      if (prevBattery != null && prevBattery > r.batteryLevel) {
        drained += prevBattery - r.batteryLevel;
      }
      prevBattery = r.batteryLevel;
    }
    if (r.thermalHeadroom != null && r.thermalHeadroom > maxHeadroom) {
      maxHeadroom = r.thermalHeadroom;
    }
    if (r.thermalStatus != null && r.thermalStatus >= THERMAL_STATUS_SEVERE) {
      redline++;
    }
    if (r.monsterMode === true && ts) {
      monsterMinutes.add(Math.floor(ts / 60_000));
    }
  }
  flush();
  return out;
}

const EMPTY_DERIVED: VitalsDerived = {
  compileSpikes: 0,
  batteryDrainRate: 0,
  thermalHeadroom: 0,
  hardwareRedline: 0,
  monsterModeMinutes: 0,
};

function deriveStatus(
  hb:
    | { lastSeen: Date | string | null; lastCleanExit: boolean | null }
    | undefined,
  now: number
): "active" | "idle" | "offline" | "crashed" {
  if (!hb || !hb.lastSeen) return "offline";
  const ts = new Date(hb.lastSeen).getTime();
  const ageSec = (now - ts) / 1000;
  if (ageSec < 60) return "active";
  if (ageSec < 300) return "idle";
  return hb.lastCleanExit === false ? "crashed" : "offline";
}

function iso(d: Date | string | null | undefined): string {
  if (!d) return "";
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

function isoOrNull(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

function coerceLight(v: string | null | undefined): "green" | "red" {
  return v === "red" ? "red" : "green";
}

function coercePerAppTaps(v: unknown): Record<string, number> | null {
  if (!v || typeof v !== "object") return null;
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === "number") out[k] = val;
    else if (typeof val === "string" && !isNaN(Number(val))) out[k] = Number(val);
  }
  return Object.keys(out).length === 0 ? null : out;
}

function coerceMembers(v: unknown): Array<{ name: string; role?: string }> | null {
  if (!Array.isArray(v)) return null;
  const out: Array<{ name: string; role?: string }> = [];
  for (const m of v) {
    if (m && typeof m === "object" && typeof (m as { name?: unknown }).name === "string") {
      const entry: { name: string; role?: string } = {
        name: (m as { name: string }).name,
      };
      const role = (m as { role?: unknown }).role;
      if (typeof role === "string") entry.role = role;
      out.push(entry);
    }
  }
  return out.length === 0 ? null : out;
}

function coerceTargetTeamIds(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const x of v) if (typeof x === "string") out.push(x);
  return out.length === 0 ? null : out;
}

async function mapWithConcurrency<T, U>(
  items: T[],
  n: number,
  fn: (item: T, idx: number) => Promise<U>
): Promise<U[]> {
  const out: U[] = new Array(items.length);
  let i = 0;
  const width = Math.min(Math.max(1, n), items.length || 1);
  const workers = Array.from({ length: width }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

// -----------------------------------------------------------------------------
// Shared assembly helper. Given a team's metadata + the pre-filtered rows from
// every table, build the TeamBundle (without screenshot bytes — those are
// fetched separately so both call paths can batch them concurrently).

interface TeamSlice {
  teamRow: typeof teams.$inferSelect;
  heartbeat: typeof heartbeats.$inferSelect | undefined;
  timelineRows: Array<typeof eventBatches.$inferSelect>;
  appUsageRows: Array<typeof appUsage.$inferSelect>;
  vitalsRows: Array<typeof deviceVitals.$inferSelect>;
  sensorRows: Array<typeof sensorAggregates.$inferSelect>;
  crashRows: Array<typeof crashLogs.$inferSelect>;
  tamperRows: Array<typeof tamperEvents.$inferSelect>;
  screenshotRows: Array<typeof screenshotRequests.$inferSelect>;
  cameraOpenCount: number;
  clipboardEventCount: number;
  longestSessionMs: number;
  status: "active" | "idle" | "offline" | "crashed";
}

function assembleTeamBundle(
  slice: TeamSlice,
  hackathonCtx: BundleHackathon,
  generatedAt: string,
  screenshots: ScreenshotPayload[]
): TeamBundle {
  const { teamRow, heartbeat } = slice;

  // Aggregate per-app foreground minutes across snapshots (matches the
  // grouping done in /api/team/[id]/app-usage).
  const usageMap = new Map<string, AppUsageRow>();
  for (const u of slice.appUsageRows) {
    const key = u.appPackage;
    const existing = usageMap.get(key);
    if (existing) {
      existing.foregroundMinutes += u.foregroundMinutes ?? 0;
      existing.openCount += u.openCount ?? 0;
      if (!existing.appLabel && u.appLabel) existing.appLabel = u.appLabel;
    } else {
      usageMap.set(key, {
        appPackage: u.appPackage,
        appLabel: u.appLabel ?? null,
        foregroundMinutes: u.foregroundMinutes ?? 0,
        openCount: u.openCount ?? 0,
      });
    }
  }
  const appUsageOut = Array.from(usageMap.values()).sort(
    (a, b) => b.foregroundMinutes - a.foregroundMinutes
  );

  const timeline: TimelineRow[] = slice.timelineRows
    .slice()
    .sort(
      (a, b) =>
        new Date(a.periodStart).getTime() - new Date(b.periodStart).getTime()
    )
    .map((r) => ({
      periodStart: iso(r.periodStart),
      periodEnd: iso(r.periodEnd),
      taps: r.taps ?? null,
      textInputs: r.textInputs ?? null,
      scrolls: r.scrolls ?? null,
      appSwitches: r.appSwitches ?? null,
      keyboardActiveSeconds: r.keyboardActiveSeconds ?? null,
      officeKitSeconds: r.officeKitSeconds ?? null,
      foregroundApp: r.foregroundApp ?? null,
      perAppTaps: coercePerAppTaps(r.perAppTaps),
    }));

  const vitals: VitalsRow[] = slice.vitalsRows
    .slice()
    .sort(
      (a, b) =>
        new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
    )
    .map((v) => ({
      recordedAt: iso(v.recordedAt),
      batteryLevel: v.batteryLevel ?? null,
      temperature: v.temperature ?? null,
      cpuUsage: v.cpuUsage ?? null,
      thermalStatus: v.thermalStatus ?? null,
      thermalHeadroom: v.thermalHeadroom ?? null,
      monsterMode: v.monsterMode ?? null,
      memAvailableMb: v.memAvailableMb ?? null,
      memTotalMb: v.memTotalMb ?? null,
      isCharging: v.isCharging ?? null,
      chargingType: v.chargingType ?? null,
      networkType: v.networkType ?? null,
      cellularDbm: v.cellularDbm ?? null,
      wifiRssi: v.wifiRssi ?? null,
      dataRxMb: v.dataRxMb ?? null,
      dataTxMb: v.dataTxMb ?? null,
    }));

  const sensors: SensorRow[] = slice.sensorRows
    .slice()
    .sort(
      (a, b) =>
        new Date(a.periodStart).getTime() - new Date(b.periodStart).getTime()
    )
    .map((s) => ({
      periodStart: iso(s.periodStart),
      periodEnd: iso(s.periodEnd),
      accelMean: s.accelMean ?? null,
      accelStddev: s.accelStddev ?? null,
      accelPeak: s.accelPeak ?? null,
      gyroMean: s.gyroMean ?? null,
      gyroStddev: s.gyroStddev ?? null,
      gyroPeak: s.gyroPeak ?? null,
      magnetoMean: s.magnetoMean ?? null,
      luxMean: s.luxMean ?? null,
      proximityNearPct: s.proximityNearPct ?? null,
      stepsDelta: s.stepsDelta ?? null,
    }));

  const crashes: CrashRow[] = slice.crashRows
    .slice()
    .sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
    )
    .map((c) => ({
      id: c.id,
      occurredAt: iso(c.occurredAt),
      threadName: c.threadName ?? null,
      stacktrace: c.stacktrace ?? null,
      foregroundApp: c.foregroundApp ?? null,
      reason: c.reason ?? null,
    }));

  const tamper: TamperRow[] = slice.tamperRows
    .slice()
    .sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
    )
    .map((t) => ({
      id: t.id,
      type: t.type,
      detail: t.detail,
      occurredAt: iso(t.occurredAt),
      resolvedAt: isoOrNull(t.resolvedAt),
    }));

  const totals = {
    taps: 0,
    textInputs: 0,
    scrolls: 0,
    appSwitches: 0,
    keyboardActiveSeconds: 0,
    officeKitSeconds: 0,
    cameraOpens: slice.cameraOpenCount,
    clipboardEvents: slice.clipboardEventCount,
    crashCount: crashes.length,
    tamperCount: tamper.length,
    longestSessionMinutes: Math.round(slice.longestSessionMs / 60000),
  };
  for (const r of slice.timelineRows) {
    totals.taps += r.taps ?? 0;
    totals.textInputs += r.textInputs ?? 0;
    totals.scrolls += r.scrolls ?? 0;
    totals.appSwitches += r.appSwitches ?? 0;
    totals.keyboardActiveSeconds += r.keyboardActiveSeconds ?? 0;
    totals.officeKitSeconds += r.officeKitSeconds ?? 0;
  }

  return {
    generatedAt,
    hackathon: hackathonCtx,
    team: {
      id: teamRow.id,
      name: teamRow.name,
      deviceId: teamRow.deviceId ?? null,
      members: coerceMembers(teamRow.members),
      createdAt: isoOrNull(teamRow.createdAt),
    },
    status: slice.status,
    heartbeat: heartbeat
      ? {
          lastSeen: isoOrNull(heartbeat.lastSeen),
          batteryLevel: heartbeat.batteryLevel ?? null,
          temperature: heartbeat.temperature ?? null,
          lastCleanExit: heartbeat.lastCleanExit ?? true,
        }
      : null,
    totals,
    timeline,
    appUsage: appUsageOut,
    vitals,
    sensors,
    crashes,
    tamper,
    screenshots,
  };
}

// Pick the last MAX_SCREENSHOTS_PER_TEAM captured screenshots, then concurrently
// fetch their bytes (subject to MAX_SCREENSHOT_BYTES). Pending/failed shots are
// kept in the bundle as metadata-only entries so the report still mentions
// them.
async function buildScreenshotPayloads(
  rows: Array<typeof screenshotRequests.$inferSelect>
): Promise<ScreenshotPayload[]> {
  const captured = rows
    .filter((r) => r.status === "captured" && r.imageUrl)
    .sort((a, b) => {
      const at = a.capturedAt ? new Date(a.capturedAt).getTime() : 0;
      const bt = b.capturedAt ? new Date(b.capturedAt).getTime() : 0;
      return bt - at;
    })
    .slice(0, MAX_SCREENSHOTS_PER_TEAM);

  const fetched = await mapWithConcurrency(captured, 4, async (row) => {
    const res = await fetchScreenshotBytes(row.id);
    const base = {
      id: row.id,
      requestedAt: iso(row.requestedAt),
      capturedAt: isoOrNull(row.capturedAt),
      status: row.status as ScreenshotPayload["status"],
      imageUrl: row.imageUrl ?? null,
    };
    if (res.ok) {
      return { ...base, bytes: res.data.bytes, mime: res.data.mime } as ScreenshotPayload;
    }
    return {
      ...base,
      bytes: null,
      mime: null,
      skippedReason: res.reason,
    } as ScreenshotPayload;
  });

  // Append non-captured rows as metadata-only entries (no bytes, no fetch).
  const tail: ScreenshotPayload[] = rows
    .filter((r) => r.status !== "captured" || !r.imageUrl)
    .sort((a, b) => {
      const at = new Date(a.requestedAt).getTime();
      const bt = new Date(b.requestedAt).getTime();
      return bt - at;
    })
    .slice(0, MAX_SCREENSHOTS_PER_TEAM)
    .map((row) => ({
      id: row.id,
      requestedAt: iso(row.requestedAt),
      capturedAt: isoOrNull(row.capturedAt),
      status: row.status as ScreenshotPayload["status"],
      imageUrl: row.imageUrl ?? null,
      bytes: null,
      mime: null,
      skippedReason: "no-bytes" as const,
    }));

  return [...fetched, ...tail];
}

// -----------------------------------------------------------------------------
// Team scope

export async function gatherTeamBundle(teamId: string): Promise<TeamBundle | null> {
  const [teamRow] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!teamRow) return null;

  const [hk] = await db
    .select()
    .from(hackathons)
    .where(eq(hackathons.id, teamRow.hackathonId))
    .limit(1);
  if (!hk) return null;

  const hackathonCtx: BundleHackathon = {
    id: hk.id,
    name: hk.name,
    startTime: iso(hk.startTime),
    endTime: iso(hk.endTime),
    currentLight: coerceLight(hk.currentLight),
    status: hk.status,
    scoringConfig: hk.scoringConfig,
  };

  const [
    timelineRows,
    appUsageRows,
    vitalsRows,
    sensorRows,
    crashRows,
    tamperRows,
    screenshotRows,
    heartbeatRows,
    cameraCountRows,
    clipboardCountRows,
    vitalTicks,
  ] = await Promise.all([
    db.select().from(eventBatches).where(eq(eventBatches.teamId, teamId)),
    db.select().from(appUsage).where(eq(appUsage.teamId, teamId)),
    db
      .select()
      .from(deviceVitals)
      .where(eq(deviceVitals.teamId, teamId))
      .orderBy(asc(deviceVitals.recordedAt)),
    db.select().from(sensorAggregates).where(eq(sensorAggregates.teamId, teamId)),
    db.select().from(crashLogs).where(eq(crashLogs.teamId, teamId)),
    db.select().from(tamperEvents).where(eq(tamperEvents.teamId, teamId)),
    db
      .select()
      .from(screenshotRequests)
      .where(eq(screenshotRequests.teamId, teamId))
      .orderBy(desc(screenshotRequests.requestedAt))
      .limit(MAX_SCREENSHOTS_PER_TEAM * 4), // leeway for non-captured rows
    db.select().from(heartbeats).where(eq(heartbeats.teamId, teamId)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(cameraEvents)
      .where(eq(cameraEvents.teamId, teamId)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(clipboardEvents)
      .where(eq(clipboardEvents.teamId, teamId)),
    db
      .select({ teamId: deviceVitals.teamId, recordedAt: deviceVitals.recordedAt })
      .from(deviceVitals)
      .where(eq(deviceVitals.teamId, teamId))
      .orderBy(asc(deviceVitals.recordedAt)),
  ]);

  const heartbeat = heartbeatRows
    .slice()
    .sort(
      (a, b) =>
        new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime()
    )[0];

  const longestSessionMs =
    computeLongestSessionMsPerTeam(vitalTicks).get(teamId) ?? 0;

  const screenshots = await buildScreenshotPayloads(screenshotRows);

  const generatedAt = new Date().toISOString();

  return assembleTeamBundle(
    {
      teamRow,
      heartbeat,
      timelineRows,
      appUsageRows,
      vitalsRows,
      sensorRows,
      crashRows,
      tamperRows,
      screenshotRows,
      cameraOpenCount: cameraCountRows[0]?.count ?? 0,
      clipboardEventCount: clipboardCountRows[0]?.count ?? 0,
      longestSessionMs,
      status: deriveStatus(heartbeat, Date.now()),
    },
    hackathonCtx,
    generatedAt,
    screenshots
  );
}

// -----------------------------------------------------------------------------
// Hackathon scope

export async function gatherHackathonBundle(
  hackathonId: string
): Promise<HackathonBundle | null> {
  const [hk] = await db
    .select()
    .from(hackathons)
    .where(eq(hackathons.id, hackathonId))
    .limit(1);
  if (!hk) return null;

  const hackathonCtx: BundleHackathon = {
    id: hk.id,
    name: hk.name,
    startTime: iso(hk.startTime),
    endTime: iso(hk.endTime),
    currentLight: coerceLight(hk.currentLight),
    status: hk.status,
    scoringConfig: hk.scoringConfig,
  };

  const [
    teamRows,
    timelineRows,
    appUsageRows,
    vitalsRows,
    sensorRows,
    crashRows,
    tamperRows,
    screenshotRows,
    heartbeatRows,
    cameraCountRows,
    clipboardCountRows,
    vitalTicks,
    lightRows,
    notificationRows,
    idleWarningRows,
  ] = await Promise.all([
    db.select().from(teams).where(eq(teams.hackathonId, hackathonId)),
    db.select().from(eventBatches).where(eq(eventBatches.hackathonId, hackathonId)),
    db.select().from(appUsage).where(eq(appUsage.hackathonId, hackathonId)),
    db
      .select()
      .from(deviceVitals)
      .where(eq(deviceVitals.hackathonId, hackathonId))
      .orderBy(asc(deviceVitals.teamId), asc(deviceVitals.recordedAt)),
    db
      .select()
      .from(sensorAggregates)
      .where(eq(sensorAggregates.hackathonId, hackathonId)),
    db.select().from(crashLogs).where(eq(crashLogs.hackathonId, hackathonId)),
    db.select().from(tamperEvents).where(eq(tamperEvents.hackathonId, hackathonId)),
    db
      .select()
      .from(screenshotRequests)
      .where(
        and(
          eq(screenshotRequests.hackathonId, hackathonId),
          isNotNull(screenshotRequests.requestedAt)
        )
      )
      .orderBy(desc(screenshotRequests.requestedAt)),
    db.select().from(heartbeats).where(eq(heartbeats.hackathonId, hackathonId)),
    db
      .select({
        teamId: cameraEvents.teamId,
        count: sql<number>`count(*)::int`,
      })
      .from(cameraEvents)
      .where(eq(cameraEvents.hackathonId, hackathonId))
      .groupBy(cameraEvents.teamId),
    db
      .select({
        teamId: clipboardEvents.teamId,
        count: sql<number>`count(*)::int`,
      })
      .from(clipboardEvents)
      .where(eq(clipboardEvents.hackathonId, hackathonId))
      .groupBy(clipboardEvents.teamId),
    db
      .select({ teamId: deviceVitals.teamId, recordedAt: deviceVitals.recordedAt })
      .from(deviceVitals)
      .where(eq(deviceVitals.hackathonId, hackathonId))
      .orderBy(asc(deviceVitals.teamId), asc(deviceVitals.recordedAt)),
    db
      .select()
      .from(lightTransitions)
      .where(eq(lightTransitions.hackathonId, hackathonId))
      .orderBy(asc(lightTransitions.changedAt)),
    db
      .select()
      .from(notifications)
      .where(eq(notifications.hackathonId, hackathonId))
      .orderBy(desc(notifications.createdAt)),
    db
      .select({
        teamId: organiserAlerts.teamId,
        count: sql<number>`count(*)::int`,
      })
      .from(organiserAlerts)
      .where(
        and(
          eq(organiserAlerts.hackathonId, hackathonId),
          eq(organiserAlerts.type, "idle_warning")
        )
      )
      .groupBy(organiserAlerts.teamId),
  ]);

  // Bucket every row by teamId.
  const groupBy = <T extends { teamId: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) {
      const list = m.get(r.teamId);
      if (list) list.push(r);
      else m.set(r.teamId, [r]);
    }
    return m;
  };
  const timelineByTeam = groupBy(timelineRows);
  const appUsageByTeam = groupBy(appUsageRows);
  const vitalsByTeam = groupBy(vitalsRows);
  const sensorsByTeam = groupBy(sensorRows);
  const crashesByTeam = groupBy(crashRows);
  const tamperByTeam = groupBy(tamperRows);
  const screenshotsByTeam = groupBy(screenshotRows);

  const cameraCountMap = new Map(cameraCountRows.map((r) => [r.teamId, r.count]));
  const clipboardCountMap = new Map(clipboardCountRows.map((r) => [r.teamId, r.count]));
  const idleWarningMap = new Map(idleWarningRows.map((r) => [r.teamId, r.count]));

  // Latest heartbeat per team.
  const heartbeatByTeam = new Map<string, typeof heartbeatRows[number]>();
  for (const h of heartbeatRows) {
    const existing = heartbeatByTeam.get(h.teamId);
    if (
      !existing ||
      (h.lastSeen && new Date(h.lastSeen) > new Date(existing.lastSeen))
    ) {
      heartbeatByTeam.set(h.teamId, h);
    }
  }

  const longestSessionByTeam = computeLongestSessionMsPerTeam(vitalTicks);
  const vitalsDerivedByTeam = deriveVitalsPerTeam(
    vitalsRows.map((v) => ({
      teamId: v.teamId,
      recordedAt: v.recordedAt,
      cpuUsage: v.cpuUsage,
      batteryLevel: v.batteryLevel,
      thermalHeadroom: v.thermalHeadroom,
      thermalStatus: v.thermalStatus,
      monsterMode: v.monsterMode,
    }))
  );

  // Build leaderboard ranking using the same TeamRawMetrics shape the
  // live route uses, so the export's scoring matches the dashboard exactly.
  const teamAgg = new Map<
    string,
    { officeKitSec: number; textInputs: number; kbSec: number }
  >();
  for (const t of teamRows) {
    teamAgg.set(t.id, { officeKitSec: 0, textInputs: 0, kbSec: 0 });
  }
  for (const r of timelineRows) {
    const agg = teamAgg.get(r.teamId);
    if (!agg) continue;
    agg.officeKitSec += r.officeKitSeconds ?? 0;
    agg.textInputs += r.textInputs ?? 0;
    agg.kbSec += r.keyboardActiveSeconds ?? 0;
  }
  const crashCountByTeam = new Map<string, number>();
  for (const c of crashRows) {
    crashCountByTeam.set(c.teamId, (crashCountByTeam.get(c.teamId) ?? 0) + 1);
  }

  const teamMetrics: TeamRawMetrics[] = teamRows.map((t) => {
    const agg = teamAgg.get(t.id) ?? { officeKitSec: 0, textInputs: 0, kbSec: 0 };
    const v = vitalsDerivedByTeam.get(t.id) ?? EMPTY_DERIVED;
    return {
      teamId: t.id,
      teamName: t.name,
      officeKitMinutes: Math.round(agg.officeKitSec / 60),
      compileSpikes: v.compileSpikes,
      typingDensity: agg.textInputs + agg.kbSec,
      batteryDrainRate: Number(v.batteryDrainRate.toFixed(2)),
      thermalHeadroom: v.thermalHeadroom,
      hardwareRedline: v.hardwareRedline,
      monsterModeMinutes: v.monsterModeMinutes,
      crashCount: crashCountByTeam.get(t.id) ?? 0,
      idleWarningCount: idleWarningMap.get(t.id) ?? 0,
    };
  });

  const { rankings, weights } = computeBuildScores(
    teamMetrics,
    (hk.scoringConfig ?? null) as ScoringConfig | null
  );

  const generatedAt = new Date().toISOString();
  const now = Date.now();

  // Fetch every team's screenshot bytes concurrently (capped). One worker
  // pool across the whole hackathon — keeps total parallel S3 hits at 4.
  const screenshotPayloadsByTeam = new Map<string, ScreenshotPayload[]>();
  await mapWithConcurrency(teamRows, 4, async (team) => {
    const rows = screenshotsByTeam.get(team.id) ?? [];
    screenshotPayloadsByTeam.set(team.id, await buildScreenshotPayloads(rows));
  });

  const teamBundles: TeamBundle[] = teamRows.map((teamRow) => {
    const hb = heartbeatByTeam.get(teamRow.id);
    return assembleTeamBundle(
      {
        teamRow,
        heartbeat: hb,
        timelineRows: timelineByTeam.get(teamRow.id) ?? [],
        appUsageRows: appUsageByTeam.get(teamRow.id) ?? [],
        vitalsRows: vitalsByTeam.get(teamRow.id) ?? [],
        sensorRows: sensorsByTeam.get(teamRow.id) ?? [],
        crashRows: crashesByTeam.get(teamRow.id) ?? [],
        tamperRows: tamperByTeam.get(teamRow.id) ?? [],
        screenshotRows: screenshotsByTeam.get(teamRow.id) ?? [],
        cameraOpenCount: cameraCountMap.get(teamRow.id) ?? 0,
        clipboardEventCount: clipboardCountMap.get(teamRow.id) ?? 0,
        longestSessionMs: longestSessionByTeam.get(teamRow.id) ?? 0,
        status: deriveStatus(hb, now),
      },
      hackathonCtx,
      generatedAt,
      screenshotPayloadsByTeam.get(teamRow.id) ?? []
    );
  });

  const lightTransitionsOut: LightTransitionRow[] = lightRows.map((l) => ({
    id: l.id,
    light: l.light,
    changedAt: iso(l.changedAt),
    changedBy: l.changedBy ?? null,
  }));

  const notificationsOut: NotificationRow[] = notificationRows.map((n) => ({
    id: n.id,
    title: n.title,
    message: n.message,
    targetFilter: n.targetFilter,
    targetMinTaps: n.targetMinTaps ?? null,
    targetMaxTaps: n.targetMaxTaps ?? null,
    targetTeamIds: coerceTargetTeamIds(n.targetTeamIds),
    createdAt: iso(n.createdAt),
  }));

  return {
    generatedAt,
    hackathon: hackathonCtx,
    rankings,
    weights,
    lightTransitions: lightTransitionsOut,
    notifications: notificationsOut,
    teams: teamBundles,
  };
}
