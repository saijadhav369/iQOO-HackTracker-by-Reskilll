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

// Rows MUST be grouped by team and ordered by recordedAt ascending.
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
      // Only count drops; charging (level rising) doesn't earn drain credit.
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
            recordedAt: deviceVitals.recordedAt,
            cpuUsage: deviceVitals.cpuUsage,
            batteryLevel: deviceVitals.batteryLevel,
            thermalHeadroom: deviceVitals.thermalHeadroom,
            thermalStatus: deviceVitals.thermalStatus,
            monsterMode: deviceVitals.monsterMode,
          })
          .from(deviceVitals)
          .where(eq(deviceVitals.hackathonId, id))
          .orderBy(asc(deviceVitals.teamId), asc(deviceVitals.recordedAt)),
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
