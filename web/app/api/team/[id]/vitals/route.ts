import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deviceVitals, teamMembers } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [rows, members] = await Promise.all([
      db
        .select({
          deviceId: deviceVitals.deviceId,
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
        .orderBy(asc(deviceVitals.recordedAt)),
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
