import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  teams,
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

// Rows MUST be ordered by (teamId asc, deviceId asc, recordedAt asc).
// Multi-phone teams: we accumulate per (team, device) so CPU/battery deltas
// only compare consecutive samples from the same phone, then fold per-device
// state into the team result. Without per-device partitioning, interleaved
// samples from different phones generate phantom compile spikes and inflate
// battery drain. See plan: okay-add-such-a-optimized-puppy.md.
function deriveVitalsPerTeam(rows: VitalRow[]): Map<string, VitalsDerived> {
  const out = new Map<string, VitalsDerived>();

  let team: string | null = null;
  let device: string | null = null;

  // Per-device accumulators (reset on each device boundary):
  let prevCpu: number | null = null;
  let prevBattery: number | null = null;
  let deviceFirstTs = 0;
  let deviceLastTs = 0;
  let deviceSpikes = 0;
  let deviceDrained = 0;

  // Per-team folded state (reset on each team boundary):
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
    // Null deviceId would collapse all unattributed rows into one bucket per
    // team — treat each as its own pseudo-device keyed by row index to be safe.
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
      // Only count drops; charging (level rising) doesn't earn drain credit.
      if (prevBattery != null && prevBattery > r.batteryLevel) {
        deviceDrained += prevBattery - r.batteryLevel;
      }
      prevBattery = r.batteryLevel;
    }

    // Team-wide signals (no per-device walk needed):
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

    const [teamRows, batchRows, vitalRows, crashRows, idleWarningRows] =
      await Promise.all([
        db.select().from(teams).where(eq(teams.hackathonId, id)),
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
        db
          .select({
            teamId: deviceVitals.teamId,
            // Multi-phone teams: partition the per-phone walks so CPU/battery
            // deltas only compare consecutive samples from the same device.
            // Legacy rows have deviceId = null and collapse into a single
            // "__nodevice__" pseudo-device per team (preserves old behavior).
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

    const batchMap = new Map(batchRows.map((r) => [r.teamId, r]));
    const vitalsMap = deriveVitalsPerTeam(vitalRows);
    const crashMap = new Map(crashRows.map((r) => [r.teamId, r.count]));
    const idleMap = new Map(idleWarningRows.map((r) => [r.teamId, r.count]));

    const teamMetrics: TeamRawMetrics[] = teamRows.map((team) => {
      const batch = batchMap.get(team.id);
      const v = vitalsMap.get(team.id) ?? EMPTY_DERIVED;
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

    return NextResponse.json(
      { rankings, weights, generatedAt: new Date().toISOString() },
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
