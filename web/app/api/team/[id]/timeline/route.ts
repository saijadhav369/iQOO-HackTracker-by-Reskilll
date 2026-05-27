export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eventBatches, teamMembers } from "@/lib/db/schema";
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
          deviceId: eventBatches.deviceId,
          periodStart: eventBatches.periodStart,
          periodEnd: eventBatches.periodEnd,
          taps: eventBatches.taps,
          textInputs: eventBatches.textInputs,
          scrolls: eventBatches.scrolls,
          appSwitches: eventBatches.appSwitches,
          keyboardActiveSeconds: eventBatches.keyboardActiveSeconds,
          officeKitSeconds: eventBatches.officeKitSeconds,
          foregroundApp: eventBatches.foregroundApp,
          perAppTaps: eventBatches.perAppTaps,
        })
        .from(eventBatches)
        .where(eq(eventBatches.teamId, id))
        .orderBy(asc(eventBatches.periodStart)),
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
