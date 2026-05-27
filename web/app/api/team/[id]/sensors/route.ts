export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sensorAggregates, teamMembers } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [rows, members] = await Promise.all([
      db
        .select({
          deviceId: sensorAggregates.deviceId,
          periodStart: sensorAggregates.periodStart,
          periodEnd: sensorAggregates.periodEnd,
          accelMean: sensorAggregates.accelMean,
          accelStddev: sensorAggregates.accelStddev,
          accelPeak: sensorAggregates.accelPeak,
          gyroMean: sensorAggregates.gyroMean,
          gyroStddev: sensorAggregates.gyroStddev,
          gyroPeak: sensorAggregates.gyroPeak,
          magnetoMean: sensorAggregates.magnetoMean,
          luxMean: sensorAggregates.luxMean,
          proximityNearPct: sensorAggregates.proximityNearPct,
          stepsDelta: sensorAggregates.stepsDelta,
        })
        .from(sensorAggregates)
        .where(eq(sensorAggregates.teamId, id))
        .orderBy(asc(sensorAggregates.periodStart)),
      db
        .select({
          deviceId: teamMembers.deviceId,
          slot: teamMembers.slot,
          memberName: teamMembers.memberName,
        })
        .from(teamMembers)
        .where(eq(teamMembers.teamId, id))
        .orderBy(asc(teamMembers.slot)),
    ]);

    return NextResponse.json({ members, rows });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
