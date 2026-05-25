import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deviceVitals } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const rows = await db
      .select({
        recordedAt: deviceVitals.recordedAt,
        batteryLevel: deviceVitals.batteryLevel,
        temperature: deviceVitals.temperature,
        cpuUsage: deviceVitals.cpuUsage,
        thermalStatus: deviceVitals.thermalStatus,
        thermalHeadroom: deviceVitals.thermalHeadroom,
        monsterMode: deviceVitals.monsterMode,
        memAvailableMb: deviceVitals.memAvailableMb,
        memTotalMb: deviceVitals.memTotalMb,
        isCharging: deviceVitals.isCharging,
        chargingType: deviceVitals.chargingType,
        networkType: deviceVitals.networkType,
        cellularDbm: deviceVitals.cellularDbm,
        wifiRssi: deviceVitals.wifiRssi,
        dataRxMb: deviceVitals.dataRxMb,
        dataTxMb: deviceVitals.dataTxMb,
      })
      .from(deviceVitals)
      .where(eq(deviceVitals.teamId, id))
      .orderBy(deviceVitals.recordedAt);

    return NextResponse.json(rows);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
