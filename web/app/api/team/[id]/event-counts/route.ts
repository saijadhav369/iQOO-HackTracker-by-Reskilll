export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cameraEvents, clipboardEvents, teamMembers } from "@/lib/db/schema";
import { asc, eq, sql } from "drizzle-orm";

// Per-device counts of discrete events. Caller (team detail page) sums
// rows for the Team tab and filters for per-member tabs.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [camera, clipboard, members] = await Promise.all([
      db
        .select({
          deviceId: cameraEvents.deviceId,
          count: sql<number>`count(*)::int`,
        })
        .from(cameraEvents)
        .where(eq(cameraEvents.teamId, id))
        .groupBy(cameraEvents.deviceId),
      db
        .select({
          deviceId: clipboardEvents.deviceId,
          count: sql<number>`count(*)::int`,
        })
        .from(clipboardEvents)
        .where(eq(clipboardEvents.teamId, id))
        .groupBy(clipboardEvents.deviceId),
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

    return NextResponse.json({
      members,
      cameraByDevice: camera,
      clipboardByDevice: clipboard,
      cameraOpens: camera.reduce((s, r) => s + r.count, 0),
      clipboardEvents: clipboard.reduce((s, r) => s + r.count, 0),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
