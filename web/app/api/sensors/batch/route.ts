export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sensorAggregates } from "@/lib/db/schema";
import { sensorBatchSchema } from "@/lib/validators";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = sensorBatchSchema.parse(body);

    if (data.aggregates.length === 0) {
      return NextResponse.json({ success: true, inserted: 0 });
    }

    const rows = data.aggregates.map((a) => ({
      teamId: a.team_id,
      hackathonId: a.hackathon_id,
      deviceId: a.device_id,
      periodStart: new Date(a.period_start),
      periodEnd: new Date(a.period_end),
      accelMean: a.accel_mean ?? null,
      accelStddev: a.accel_stddev ?? null,
      accelPeak: a.accel_peak ?? null,
      gyroMean: a.gyro_mean ?? null,
      gyroStddev: a.gyro_stddev ?? null,
      gyroPeak: a.gyro_peak ?? null,
      magnetoMean: a.magneto_mean ?? null,
      luxMean: a.lux_mean ?? null,
      proximityNearPct: a.proximity_near_pct ?? null,
      stepsDelta: a.steps_delta ?? null,
    }));

    // Dedupe key (team_id, device_id, period_start). With multi-phone teams
    // two devices naturally produce sensor windows with the same period_start;
    // the device_id column splits them so neither write is dropped. Matches
    // the unique index created in migration 0016.
    const inserted = await db
      .insert(sensorAggregates)
      .values(rows)
      .onConflictDoNothing({
        target: [
          sensorAggregates.teamId,
          sensorAggregates.deviceId,
          sensorAggregates.periodStart,
        ],
      })
      .returning({ id: sensorAggregates.id });

    return NextResponse.json({ success: true, inserted: inserted.length });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
