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
  teamMembers,
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
  LeaderboardBundle,
  LeaderboardTeam,
  MemberTotals,
  ScreenshotPayload,
  TeamBundle,
  TeamMemberDetail,
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
  deviceId: string | null;
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

// Duplicated from leaderboard route — they MUST stay in sync.
// Multi-phone teams: walk per (team, device) so CPU/battery deltas only
// compare consecutive samples from the same phone, then fold into team totals.
// Rows MUST be ordered by (teamId asc, deviceId asc, recordedAt asc).
function deriveVitalsPerTeam(rows: VitalRow[]): Map<string, VitalsDerived> {
  const out = new Map<string, VitalsDerived>();

  let team: string | null = null;
  let device: string | null = null;

  let prevCpu: number | null = null;
  let prevBattery: number | null = null;
  let deviceFirstTs = 0;
  let deviceLastTs = 0;
  let deviceSpikes = 0;
  let deviceDrained = 0;

  let teamSpikes = 0;
  let teamDrained = 0;
  let teamObservedMs = 0;
  let teamMaxHeadroom = 0;
  let teamRedline = 0;
  let teamMonsterMinutes = new Set<number>();

  const foldDevice = () => {
    if (device === null) return;
    teamSpikes += deviceSpikes;
    teamDrained += deviceDrained;
    if (deviceLastTs > deviceFirstTs) {
      teamObservedMs += deviceLastTs - deviceFirstTs;
    }
  };

  const flushTeam = () => {
    if (team === null) return;
    foldDevice();
    const hours = teamObservedMs / 3_600_000;
    out.set(team, {
      compileSpikes: teamSpikes,
      batteryDrainRate: hours > 0 ? teamDrained / hours : 0,
      thermalHeadroom: teamMaxHeadroom,
      hardwareRedline: teamRedline,
      monsterModeMinutes: teamMonsterMinutes.size,
    });
  };

  const startDevice = (newDeviceKey: string, firstTs: number) => {
    prevCpu = null;
    prevBattery = null;
    deviceFirstTs = firstTs;
    deviceLastTs = firstTs;
    deviceSpikes = 0;
    deviceDrained = 0;
    device = newDeviceKey;
  };

  const startTeam = (newTeam: string) => {
    teamSpikes = 0;
    teamDrained = 0;
    teamObservedMs = 0;
    teamMaxHeadroom = 0;
    teamRedline = 0;
    teamMonsterMinutes = new Set<number>();
    team = newTeam;
    device = null;
  };

  for (const r of rows) {
    const ts = r.recordedAt ? new Date(r.recordedAt).getTime() : 0;
    const rowDevice = r.deviceId ?? `__nodevice__`;

    if (r.teamId !== team) {
      flushTeam();
      startTeam(r.teamId);
      startDevice(rowDevice, ts);
    } else if (rowDevice !== device) {
      foldDevice();
      startDevice(rowDevice, ts);
    }

    if (ts) deviceLastTs = ts;

    if (r.cpuUsage != null) {
      if (prevCpu != null && r.cpuUsage - prevCpu > COMPILE_SPIKE_DELTA) deviceSpikes++;
      prevCpu = r.cpuUsage;
    }
    if (r.batteryLevel != null) {
      if (prevBattery != null && prevBattery > r.batteryLevel) {
        deviceDrained += prevBattery - r.batteryLevel;
      }
      prevBattery = r.batteryLevel;
    }
    if (r.thermalHeadroom != null && r.thermalHeadroom > teamMaxHeadroom) {
      teamMaxHeadroom = r.thermalHeadroom;
    }
    if (r.thermalStatus != null && r.thermalStatus >= THERMAL_STATUS_SEVERE) {
      teamRedline++;
    }
    if (r.monsterMode === true && ts) {
      teamMonsterMinutes.add(Math.floor(ts / 60_000));
    }
  }
  flushTeam();
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

function membersFromTable(
  rows: Array<{ slot: number; memberName: string }>
): Array<{ name: string; role?: string }> | null {
  if (rows.length === 0) return null;
  return rows
    .slice()
    .sort((a, b) => a.slot - b.slot)
    .map((m) => ({ name: `Member ${m.slot}: ${m.memberName}` }));
}

// Group a team's event-batch rows by device and fold into a flat MemberTotals.
// Skips rows whose deviceId is null (defensive — every batch should carry one).
function aggregateMemberTotals(
  rows: Array<typeof eventBatches.$inferSelect>,
  crashRows: Array<typeof crashLogs.$inferSelect>
): Map<string, MemberTotals> {
  const out = new Map<string, MemberTotals>();
  const ensure = (dev: string) => {
    let m = out.get(dev);
    if (!m) {
      m = {
        taps: 0,
        textInputs: 0,
        scrolls: 0,
        appSwitches: 0,
        keyboardActiveSeconds: 0,
        officeKitSeconds: 0,
        crashCount: 0,
      };
      out.set(dev, m);
    }
    return m;
  };
  for (const r of rows) {
    if (!r.deviceId) continue;
    const m = ensure(r.deviceId);
    m.taps += r.taps ?? 0;
    m.textInputs += r.textInputs ?? 0;
    m.scrolls += r.scrolls ?? 0;
    m.appSwitches += r.appSwitches ?? 0;
    m.keyboardActiveSeconds += r.keyboardActiveSeconds ?? 0;
    m.officeKitSeconds += r.officeKitSeconds ?? 0;
  }
  for (const c of crashRows) {
    if (!c.deviceId) continue;
    ensure(c.deviceId).crashCount += 1;
  }
  return out;
}

function emptyMemberTotals(): MemberTotals {
  return {
    taps: 0,
    textInputs: 0,
    scrolls: 0,
    appSwitches: 0,
    keyboardActiveSeconds: 0,
    officeKitSeconds: 0,
    crashCount: 0,
  };
}

function buildMembersDetail(
  memberRows: Array<{ slot: number; memberName: string; deviceId: string | null }>,
  totalsByDevice: Map<string, MemberTotals>,
  heartbeatsByDevice: Map<string, typeof heartbeats.$inferSelect>,
  now: number
): TeamMemberDetail[] {
  return memberRows
    .slice()
    .sort((a, b) => a.slot - b.slot)
    .map((m) => {
      const dev = m.deviceId;
      const hb = dev ? heartbeatsByDevice.get(dev) : undefined;
      return {
        slot: m.slot,
        memberName: m.memberName,
        deviceId: dev,
        lastSeen: hb?.lastSeen ? iso(hb.lastSeen) : null,
        batteryLevel: hb?.batteryLevel ?? null,
        status: deriveStatus(hb, now),
        totals: (dev && totalsByDevice.get(dev)) || emptyMemberTotals(),
      };
    });
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
  memberRows: Array<{ slot: number; memberName: string; deviceId: string | null }>;
  heartbeat: typeof heartbeats.$inferSelect | undefined;
  // Latest heartbeat per device (for per-member online/battery in the report).
  heartbeatsByDevice: Map<string, typeof heartbeats.$inferSelect>;
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
  buildScore: number | null;
  buildRank: number | null;
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

  const memberTotalsByDevice = aggregateMemberTotals(
    slice.timelineRows,
    slice.crashRows
  );
  const membersDetail = buildMembersDetail(
    slice.memberRows,
    memberTotalsByDevice,
    slice.heartbeatsByDevice,
    Date.now()
  );

  return {
    generatedAt,
    hackathon: hackathonCtx,
    team: {
      id: teamRow.id,
      name: teamRow.name,
      deviceId: teamRow.deviceId ?? null,
      members: membersFromTable(slice.memberRows),
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
    buildScore: slice.buildScore,
    buildRank: slice.buildRank,
    membersDetail,
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
    memberRows,
  ] = await Promise.all([
    db.select().from(eventBatches).where(eq(eventBatches.teamId, teamId)),
    db.select().from(appUsage).where(eq(appUsage.teamId, teamId)),
    db
      .select()
      .from(deviceVitals)
      .where(eq(deviceVitals.teamId, teamId))
      .orderBy(asc(deviceVitals.deviceId), asc(deviceVitals.recordedAt)),
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
    db
      .select({
        slot: teamMembers.slot,
        memberName: teamMembers.memberName,
        deviceId: teamMembers.deviceId,
      })
      .from(teamMembers)
      .where(eq(teamMembers.teamId, teamId)),
  ]);

  const heartbeat = heartbeatRows
    .slice()
    .sort(
      (a, b) =>
        new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime()
    )[0];

  // Latest heartbeat per device (so per-member battery + online dots match
  // what the dashboard shows). Keyed by deviceId.
  const heartbeatsByDevice = new Map<string, typeof heartbeatRows[number]>();
  for (const hb of heartbeatRows) {
    if (!hb.deviceId) continue;
    const existing = heartbeatsByDevice.get(hb.deviceId);
    if (
      !existing ||
      (hb.lastSeen && new Date(hb.lastSeen) > new Date(existing.lastSeen))
    ) {
      heartbeatsByDevice.set(hb.deviceId, hb);
    }
  }

  const longestSessionMs =
    computeLongestSessionMsPerTeam(vitalTicks).get(teamId) ?? 0;

  // Build score for a single team requires the full hackathon's metrics
  // (min-max normalisation). Compute the rankings once and pluck this team.
  let buildScore: number | null = null;
  let buildRank: number | null = null;
  try {
    const rankings = await computeHackathonRankings(teamRow.hackathonId, hk);
    const mine = rankings.find((r) => r.teamId === teamId);
    if (mine) {
      buildScore = mine.buildScore;
      buildRank = mine.rank;
    }
  } catch {
    // Non-fatal — leave score null and let the report omit it.
  }

  const screenshots = await buildScreenshotPayloads(screenshotRows);

  const generatedAt = new Date().toISOString();

  return assembleTeamBundle(
    {
      teamRow,
      memberRows,
      heartbeat,
      heartbeatsByDevice,
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
      buildScore,
      buildRank,
    },
    hackathonCtx,
    generatedAt,
    screenshots
  );
}

// Shared ranking computation. Duplicated input queries with
// gatherHackathonBundle below — kept simple here so single-team exports can
// surface the team's build score without re-running the entire bundle.
async function computeHackathonRankings(
  hackathonId: string,
  hk: typeof hackathons.$inferSelect
) {
  const [
    teamRows,
    timelineRows,
    vitalsRows,
    crashRows,
    idleWarningRows,
  ] = await Promise.all([
    db.select().from(teams).where(eq(teams.hackathonId, hackathonId)),
    db
      .select()
      .from(eventBatches)
      .where(eq(eventBatches.hackathonId, hackathonId)),
    db
      .select()
      .from(deviceVitals)
      .where(eq(deviceVitals.hackathonId, hackathonId))
      .orderBy(
        asc(deviceVitals.teamId),
        asc(deviceVitals.deviceId),
        asc(deviceVitals.recordedAt)
      ),
    db.select().from(crashLogs).where(eq(crashLogs.hackathonId, hackathonId)),
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

  const vitalsDerivedByTeam = deriveVitalsPerTeam(
    vitalsRows.map((v) => ({
      teamId: v.teamId,
      deviceId: v.deviceId,
      recordedAt: v.recordedAt,
      cpuUsage: v.cpuUsage,
      batteryLevel: v.batteryLevel,
      thermalHeadroom: v.thermalHeadroom,
      thermalStatus: v.thermalStatus,
      monsterMode: v.monsterMode,
    }))
  );

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
  const idleWarningMap = new Map(idleWarningRows.map((r) => [r.teamId, r.count]));

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

  const { rankings } = computeBuildScores(
    teamMetrics,
    (hk.scoringConfig ?? null) as ScoringConfig | null
  );
  return rankings;
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
    memberRows,
  ] = await Promise.all([
    db.select().from(teams).where(eq(teams.hackathonId, hackathonId)),
    db.select().from(eventBatches).where(eq(eventBatches.hackathonId, hackathonId)),
    db.select().from(appUsage).where(eq(appUsage.hackathonId, hackathonId)),
    db
      .select()
      .from(deviceVitals)
      .where(eq(deviceVitals.hackathonId, hackathonId))
      .orderBy(
        asc(deviceVitals.teamId),
        asc(deviceVitals.deviceId),
        asc(deviceVitals.recordedAt)
      ),
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
    db
      .select({
        teamId: teamMembers.teamId,
        slot: teamMembers.slot,
        memberName: teamMembers.memberName,
        deviceId: teamMembers.deviceId,
      })
      .from(teamMembers)
      .where(eq(teamMembers.hackathonId, hackathonId)),
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

  const membersByTeam = new Map<
    string,
    Array<{ slot: number; memberName: string; deviceId: string | null }>
  >();
  for (const m of memberRows) {
    const list = membersByTeam.get(m.teamId) ?? [];
    list.push({ slot: m.slot, memberName: m.memberName, deviceId: m.deviceId });
    membersByTeam.set(m.teamId, list);
  }

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

  // Latest heartbeat per (team, device) for per-member battery/online state.
  const heartbeatsByTeamDevice = new Map<
    string,
    Map<string, typeof heartbeatRows[number]>
  >();
  for (const h of heartbeatRows) {
    if (!h.deviceId) continue;
    let inner = heartbeatsByTeamDevice.get(h.teamId);
    if (!inner) {
      inner = new Map();
      heartbeatsByTeamDevice.set(h.teamId, inner);
    }
    const existing = inner.get(h.deviceId);
    if (
      !existing ||
      (h.lastSeen && new Date(h.lastSeen) > new Date(existing.lastSeen))
    ) {
      inner.set(h.deviceId, h);
    }
  }

  const longestSessionByTeam = computeLongestSessionMsPerTeam(vitalTicks);
  const vitalsDerivedByTeam = deriveVitalsPerTeam(
    vitalsRows.map((v) => ({
      teamId: v.teamId,
      deviceId: v.deviceId,
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

  const rankByTeam = new Map(rankings.map((r) => [r.teamId, r]));

  const teamBundles: TeamBundle[] = teamRows.map((teamRow) => {
    const hb = heartbeatByTeam.get(teamRow.id);
    const ranking = rankByTeam.get(teamRow.id);
    return assembleTeamBundle(
      {
        teamRow,
        memberRows: membersByTeam.get(teamRow.id) ?? [],
        heartbeat: hb,
        heartbeatsByDevice:
          heartbeatsByTeamDevice.get(teamRow.id) ?? new Map(),
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
        buildScore: ranking?.buildScore ?? null,
        buildRank: ranking?.rank ?? null,
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

// -----------------------------------------------------------------------------
// Leaderboard scope — concise rankings + per-member breakdown. Skips
// per-team timelines, vitals ticks, app usage, screenshots, etc., so the
// file stays small and the request finishes in a few seconds even with many
// teams.

export async function gatherLeaderboardBundle(
  hackathonId: string
): Promise<LeaderboardBundle | null> {
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

  const [teamRows, timelineRows, crashRows, heartbeatRows, memberRows] =
    await Promise.all([
      db.select().from(teams).where(eq(teams.hackathonId, hackathonId)),
      db
        .select()
        .from(eventBatches)
        .where(eq(eventBatches.hackathonId, hackathonId)),
      db.select().from(crashLogs).where(eq(crashLogs.hackathonId, hackathonId)),
      db.select().from(heartbeats).where(eq(heartbeats.hackathonId, hackathonId)),
      db
        .select({
          teamId: teamMembers.teamId,
          slot: teamMembers.slot,
          memberName: teamMembers.memberName,
          deviceId: teamMembers.deviceId,
        })
        .from(teamMembers)
        .where(eq(teamMembers.hackathonId, hackathonId)),
    ]);

  // Rankings — reuse the shared helper so the leaderboard PDF agrees with
  // both the dashboard and the full hackathon export.
  const rankings = await computeHackathonRankings(hackathonId, hk);
  const weights = computeBuildScores(
    [],
    (hk.scoringConfig ?? null) as ScoringConfig | null
  ).weights;
  const rankByTeam = new Map(rankings.map((r) => [r.teamId, r]));

  // Bucket per team.
  const timelineByTeam = new Map<string, Array<typeof timelineRows[number]>>();
  for (const r of timelineRows) {
    const list = timelineByTeam.get(r.teamId) ?? [];
    list.push(r);
    timelineByTeam.set(r.teamId, list);
  }
  const crashByTeam = new Map<string, Array<typeof crashRows[number]>>();
  for (const c of crashRows) {
    const list = crashByTeam.get(c.teamId) ?? [];
    list.push(c);
    crashByTeam.set(c.teamId, list);
  }
  const membersByTeam = new Map<
    string,
    Array<{ slot: number; memberName: string; deviceId: string | null }>
  >();
  for (const m of memberRows) {
    const list = membersByTeam.get(m.teamId) ?? [];
    list.push({ slot: m.slot, memberName: m.memberName, deviceId: m.deviceId });
    membersByTeam.set(m.teamId, list);
  }

  // Latest heartbeat per (team, device) AND per team.
  const hbByTeam = new Map<string, typeof heartbeatRows[number]>();
  const hbByTeamDevice = new Map<
    string,
    Map<string, typeof heartbeatRows[number]>
  >();
  for (const h of heartbeatRows) {
    const cur = hbByTeam.get(h.teamId);
    if (
      !cur ||
      (h.lastSeen && new Date(h.lastSeen) > new Date(cur.lastSeen))
    ) {
      hbByTeam.set(h.teamId, h);
    }
    if (h.deviceId) {
      let inner = hbByTeamDevice.get(h.teamId);
      if (!inner) {
        inner = new Map();
        hbByTeamDevice.set(h.teamId, inner);
      }
      const existing = inner.get(h.deviceId);
      if (
        !existing ||
        (h.lastSeen && new Date(h.lastSeen) > new Date(existing.lastSeen))
      ) {
        inner.set(h.deviceId, h);
      }
    }
  }

  const now = Date.now();

  // One pass: pre-rank-ordered team list.
  const orderedTeamIds = rankings.map((r) => r.teamId);
  // Append any teams that aren't in rankings (e.g. brand-new with no metrics).
  for (const t of teamRows) {
    if (!rankByTeam.has(t.id)) orderedTeamIds.push(t.id);
  }
  const teamRowById = new Map(teamRows.map((t) => [t.id, t]));

  const teamsOut: LeaderboardTeam[] = [];
  for (const teamId of orderedTeamIds) {
    const t = teamRowById.get(teamId);
    if (!t) continue;
    const ranking = rankByTeam.get(teamId);
    const tl = timelineByTeam.get(teamId) ?? [];
    const totals = {
      taps: 0,
      textInputs: 0,
      scrolls: 0,
      appSwitches: 0,
      keyboardActiveSeconds: 0,
      officeKitSeconds: 0,
      crashCount: (crashByTeam.get(teamId) ?? []).length,
    };
    for (const r of tl) {
      totals.taps += r.taps ?? 0;
      totals.textInputs += r.textInputs ?? 0;
      totals.scrolls += r.scrolls ?? 0;
      totals.appSwitches += r.appSwitches ?? 0;
      totals.keyboardActiveSeconds += r.keyboardActiveSeconds ?? 0;
      totals.officeKitSeconds += r.officeKitSeconds ?? 0;
    }

    const memberTotals = aggregateMemberTotals(tl, crashByTeam.get(teamId) ?? []);
    const membersDetail = buildMembersDetail(
      membersByTeam.get(teamId) ?? [],
      memberTotals,
      hbByTeamDevice.get(teamId) ?? new Map(),
      now
    );

    teamsOut.push({
      teamId,
      teamName: t.name,
      deviceId: t.deviceId ?? null,
      status: deriveStatus(hbByTeam.get(teamId), now),
      rank: ranking?.rank ?? orderedTeamIds.indexOf(teamId) + 1,
      buildScore: ranking?.buildScore ?? 0,
      totals,
      membersDetail,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    hackathon: hackathonCtx,
    rankings,
    weights,
    teams: teamsOut,
  };
}
