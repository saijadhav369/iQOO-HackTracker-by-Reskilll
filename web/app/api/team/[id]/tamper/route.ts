export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tamperEvents, teamMembers } from "@/lib/db/schema";
import { asc, desc, eq } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [rows, members] = await Promise.all([
      db
        .select({
          id: tamperEvents.id,
          deviceId: tamperEvents.deviceId,
          type: tamperEvents.type,
          detail: tamperEvents.detail,
          occurredAt: tamperEvents.occurredAt,
          resolvedAt: tamperEvents.resolvedAt,
        })
        .from(tamperEvents)
        .where(eq(tamperEvents.teamId, id))
        .orderBy(desc(tamperEvents.occurredAt))
        .limit(200),
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
