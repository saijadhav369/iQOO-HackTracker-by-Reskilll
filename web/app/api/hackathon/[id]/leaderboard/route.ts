import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  teams,
  teamMembers,
  hackathons,
  eventBatches,
  deviceVitals,
  crashLogs,
  organiserAlerts,
} from "@/lib/db/schema";
import { eq, sql, asc, and } from "drizzle-orm";
import {
  computeBuildScores,
  type ScoringConfig,
  type ScoredTeam,
  type TeamRawMetrics,
} from "@/lib/scoring";

// A jump in the (memory-pressure) usage signal above this many points between
// consecutive ~25s vitals samples counts as one "compile spike".
const COMPILE_SPIKE_DELTA = 50;
// PowerManager THERMAL_STATUS_SEVERE.
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

// Single-pass walk that emits BOTH per-team and per-device VitalsDerived maps.
// Rows MUST be ordered by (teamId asc, deviceId asc, recordedAt asc).
// CPU/battery deltas only compare consecutive samples from the same phone, so
// interleaved samples from different phones don't generate phantom compile
// spikes or inflate battery drain. Each device's totals are emitted into
// `byDevice` and then folded into the parent team in `byTeam`.
function deriveVitalsBothLevels(rows: VitalRow[]): {
  byTeam: Map<string, VitalsDerived>;
  byDevice: Map<string, VitalsDerived>; // key: `${teamId}|${deviceId}`
} {
  const byTeam = new Map<string, VitalsDerived>();
  const byDevice = new Map<string, VitalsDerived>();

  let team: string | null = null;
  let device: string | null = null;

  // Per-device accumulators (reset on each device boundary):
  let prevCpu: number | null = null;
  let prevBattery: number | null = null;
  let deviceFirstTs = 0;
  let deviceLastTs = 0;
  let deviceSpikes = 0;
  let deviceDrained = 0;
  let deviceMaxHeadroom = 0;
  let deviceRedline = 0;
  let deviceMonsterMinutes = new Set<number>();

  // Per-team folded state (reset on each team boundary):
  let teamSpikes = 0;
  let teamDrained = 0;
  let teamObservedMs = 0;
  let teamMaxHeadroom = 0;
  let teamRedline = 0;
  let teamMonsterMinutes = new Set<number>();

  const flushDevice = () => {
    if (team === null || device === null) return;
    const hours =
      deviceLastTs > deviceFirstTs
        ? (deviceLastTs - deviceFirstTs) / 3_600_000
        : 0;
    byDevice.set(`${team}|${device}`, {
      compileSpikes: deviceSpikes,
      batteryDrainRate: hours > 0 ? deviceDrained / hours : 0,
      thermalHeadroom: deviceMaxHeadroom,
      hardwareRedline: deviceRedline,
      monsterModeMinutes: deviceMonsterMinutes.size,
    });
    // Fold into team totals.
    teamSpikes += deviceSpikes;
    teamDrained += deviceDrained;
    if (deviceLastTs > deviceFirstTs) {
      teamObservedMs += deviceLastTs - deviceFirstTs;
    }
    if (deviceMaxHeadroom > teamMaxHeadroom) teamMaxHeadroom = deviceMaxHeadroom;
    teamRedline += deviceRedline;
    for (const m of deviceMonsterMinutes) teamMonsterMinutes.add(m);
  };

  const flushTeam = () => {
    if (team === null) return;
    flushDevice();
    const hours = teamObservedMs / 3_600_000;
    byTeam.set(team, {
      compileSpikes: teamSpikes,
      batteryDrainRate: hours > 0 ? teamDrained / hours : 0,
      thermalHeadroom: teamMaxHeadroom,
      hardwareRedline: teamRedline,
      monsterModeMinutes: teamMonsterMinutes.size,
    });
  };

  const startDevice = (newDevice: string, ts: number) => {
    prevCpu = null;
    prevBattery = null;
    deviceFirstTs = ts;
    deviceLastTs = ts;
    deviceSpikes = 0;
    deviceDrained = 0;
    deviceMaxHeadroom = 0;
    deviceRedline = 0;
    deviceMonsterMinutes = new Set<number>();
    device = newDevice;
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
    // Null deviceId would collapse all unattributed rows into one bucket per
    // team — treat each as its own pseudo-device keyed by index to be safe.
    const rowDevice = r.deviceId ?? `__nodevice__`;

    if (r.teamId !== team) {
      flushTeam();
      startTeam(r.teamId);
      startDevice(rowDevice, ts);
    } else if (rowDevice !== device) {
      flushDevice();
      startDevice(rowDevice, ts);
    }

    if (ts) deviceLastTs = ts;

    if (r.cpuUsage != null) {
      if (prevCpu != null && r.cpuUsage - prevCpu > COMPILE_SPIKE_DELTA) {
        deviceSpikes++;
      }
      prevCpu = r.cpuUsage;
    }

    if (r.batteryLevel != null) {
      if (prevBattery != null && prevBattery > r.batteryLevel) {
        deviceDrained += prevBattery - r.batteryLevel;
      }
      prevBattery = r.batteryLevel;
    }

    if (r.thermalHeadroom != null && r.thermalHeadroom > deviceMaxHeadroom) {
      deviceMaxHeadroom = r.thermalHeadroom;
    }
    if (r.thermalStatus != null && r.thermalStatus >= THERMAL_STATUS_SEVERE) {
      deviceRedline++;
    }
    if (r.monsterMode === true && ts) {
      deviceMonsterMinutes.add(Math.floor(ts / 60_000));
    }
  }
  flushTeam();
  return { byTeam, byDevice };
}

const EMPTY_DERIVED: VitalsDerived = {
  compileSpikes: 0,
  batteryDrainRate: 0,
  thermalHeadroom: 0,
  hardwareRedline: 0,
  monsterModeMinutes: 0,
};

export interface MemberScore {
  slot: number;
  memberName: string;
  deviceId: string;
  buildScore: number;
  buildScoreRaw: number;
  rank: number; // rank within the hackathon-wide member pool
  breakdown: ScoredTeam["breakdown"];
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const hackathonRows = await db
      .select({ scoringConfig: hackathons.scoringConfig })
      .from(hackathons)
      .where(eq(hackathons.id, id))
      .limit(1);
    const scoringConfig = (hackathonRows[0]?.scoringConfig ?? null) as
      | ScoringConfig
      | null;

    const [
      teamRows,
      memberRows,
      batchTeamRows,
      batchDeviceRows,
      vitalRows,
      crashRows,
      idleWarningRows,
    ] = await Promise.all([
      db.select().from(teams).where(eq(teams.hackathonId, id)),
      db
        .select({
          teamId: teamMembers.teamId,
          deviceId: teamMembers.deviceId,
          slot: teamMembers.slot,
          memberName: teamMembers.memberName,
        })
        .from(teamMembers)
        .where(eq(teamMembers.hackathonId, id))
        .orderBy(asc(teamMembers.teamId), asc(teamMembers.slot)),
      // Per-team event aggregates (for team rankings — unchanged).
      db
        .select({
          teamId: eventBatches.teamId,
          officeKitSeconds: sql<number>`coalesce(sum(${eventBatches.officeKitSeconds}), 0)::int`,
          textInputs: sql<number>`coalesce(sum(${eventBatches.textInputs}), 0)::int`,
          keyboardSeconds: sql<number>`coalesce(sum(${eventBatches.keyboardActiveSeconds}), 0)::int`,
        })
        .from(eventBatches)
        .where(eq(eventBatches.hackathonId, id))
        .groupBy(eventBatches.teamId),
      // Per-device event aggregates (for member rankings).
      db
        .select({
          teamId: eventBatches.teamId,
          deviceId: eventBatches.deviceId,
          officeKitSeconds: sql<number>`coalesce(sum(${eventBatches.officeKitSeconds}), 0)::int`,
          textInputs: sql<number>`coalesce(sum(${eventBatches.textInputs}), 0)::int`,
          keyboardSeconds: sql<number>`coalesce(sum(${eventBatches.keyboardActiveSeconds}), 0)::int`,
        })
        .from(eventBatches)
        .where(eq(eventBatches.hackathonId, id))
        .groupBy(eventBatches.teamId, eventBatches.deviceId),
      db
        .select({
          teamId: deviceVitals.teamId,
          deviceId: deviceVitals.deviceId,
          recordedAt: deviceVitals.recordedAt,
          cpuUsage: deviceVitals.cpuUsage,
          batteryLevel: deviceVitals.batteryLevel,
          thermalHeadroom: deviceVitals.thermalHeadroom,
          thermalStatus: deviceVitals.thermalStatus,
          monsterMode: deviceVitals.monsterMode,
        })
        .from(deviceVitals)
        .where(eq(deviceVitals.hackathonId, id))
        .orderBy(
          asc(deviceVitals.teamId),
          asc(deviceVitals.deviceId),
          asc(deviceVitals.recordedAt)
        ),
      db
        .select({
          teamId: crashLogs.teamId,
          count: sql<number>`count(*)::int`,
        })
        .from(crashLogs)
        .where(eq(crashLogs.hackathonId, id))
        .groupBy(crashLogs.teamId),
      db
        .select({
          teamId: organiserAlerts.teamId,
          count: sql<number>`count(*)::int`,
        })
        .from(organiserAlerts)
        .where(
          and(
            eq(organiserAlerts.hackathonId, id),
            eq(organiserAlerts.type, "idle_warning")
          )
        )
        .groupBy(organiserAlerts.teamId),
    ]);

    const batchByTeam = new Map(batchTeamRows.map((r) => [r.teamId, r]));
    const batchByDevice = new Map(
      batchDeviceRows.map((r) => [`${r.teamId}|${r.deviceId}`, r])
    );
    const { byTeam: vitalsByTeam, byDevice: vitalsByDevice } =
      deriveVitalsBothLevels(vitalRows);
    const crashMap = new Map(crashRows.map((r) => [r.teamId, r.count]));
    const idleMap = new Map(idleWarningRows.map((r) => [r.teamId, r.count]));

    // ----- Team-level metrics + scores (existing behaviour) -----
    const teamMetrics: TeamRawMetrics[] = teamRows.map((team) => {
      const batch = batchByTeam.get(team.id);
      const v = vitalsByTeam.get(team.id) ?? EMPTY_DERIVED;
      return {
        teamId: team.id,
        teamName: team.name,
        officeKitMinutes: Math.round((batch?.officeKitSeconds ?? 0) / 60),
        compileSpikes: v.compileSpikes,
        typingDensity:
          (batch?.textInputs ?? 0) + (batch?.keyboardSeconds ?? 0),
        batteryDrainRate: Number(v.batteryDrainRate.toFixed(2)),
        thermalHeadroom: v.thermalHeadroom,
        hardwareRedline: v.hardwareRedline,
        monsterModeMinutes: v.monsterModeMinutes,
        crashCount: crashMap.get(team.id) ?? 0,
        idleWarningCount: idleMap.get(team.id) ?? 0,
      };
    });

    const { rankings, weights } = computeBuildScores(teamMetrics, scoringConfig);

    // ----- Per-member metrics + scores -----
    // Each phone in the hackathon competes in one shared pool so the member's
    // build score is comparable across teams. Penalties (crashes / idle
    // warnings) are team-level only — no deviceId on those tables — so we
    // leave them at 0 on the member metrics; the team carries the demerit.
    const memberMetrics: TeamRawMetrics[] = memberRows.map((m) => {
      const batch = batchByDevice.get(`${m.teamId}|${m.deviceId}`);
      const v = vitalsByDevice.get(`${m.teamId}|${m.deviceId}`) ?? EMPTY_DERIVED;
      return {
        // Reuse ScoredTeam shape — these "team" fields actually carry per-member
        // identity through computeBuildScores so we can match them back below.
        teamId: `${m.teamId}|${m.deviceId}`,
        teamName: m.memberName,
        officeKitMinutes: Math.round((batch?.officeKitSeconds ?? 0) / 60),
        compileSpikes: v.compileSpikes,
        typingDensity:
          (batch?.textInputs ?? 0) + (batch?.keyboardSeconds ?? 0),
        batteryDrainRate: Number(v.batteryDrainRate.toFixed(2)),
        thermalHeadroom: v.thermalHeadroom,
        hardwareRedline: v.hardwareRedline,
        monsterModeMinutes: v.monsterModeMinutes,
        crashCount: 0,
        idleWarningCount: 0,
      };
    });

    const memberScored = computeBuildScores(memberMetrics, scoringConfig);

    // Re-attach slot + memberName + deviceId by unpacking the synthetic teamId.
    const memberByKey = new Map(
      memberRows.map((m) => [`${m.teamId}|${m.deviceId}`, m])
    );
    const membersByTeam: Record<string, MemberScore[]> = {};
    for (const s of memberScored.rankings) {
      const m = memberByKey.get(s.teamId);
      if (!m) continue;
      (membersByTeam[m.teamId] ??= []).push({
        slot: m.slot,
        memberName: m.memberName,
        deviceId: m.deviceId,
        buildScore: s.buildScore,
        buildScoreRaw: s.buildScoreRaw,
        rank: s.rank,
        breakdown: s.breakdown,
      });
    }
    // Stable order: by slot ascending within each team.
    for (const teamId of Object.keys(membersByTeam)) {
      membersByTeam[teamId].sort((a, b) => a.slot - b.slot);
    }

    return NextResponse.json(
      {
        rankings,
        weights,
        generatedAt: new Date().toISOString(),
        membersByTeam,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=30",
        },
      }
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
