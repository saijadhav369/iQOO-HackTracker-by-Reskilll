import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  teams,
  eventBatches,
  heartbeats,
  cameraEvents,
} from "@/lib/db/schema";
import { eq, sql, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Single query: teams + aggregated batches
    const teamRows = await db.select().from(teams).where(eq(teams.hackathonId, id));

    if (teamRows.length === 0) {
      return NextResponse.json({ teams: [], server_time: new Date().toISOString() });
    }

    const teamIds = teamRows.map((t) => t.id);

    // Run remaining queries in parallel
    const [batchTotals, latestBatches, cameraOpens, heartbeatRows] = await Promise.all([
      // Aggregate totals per team
      db
        .select({
          teamId: eventBatches.teamId,
          totalTaps: sql<number>`coalesce(sum(${eventBatches.taps}), 0)::int`,
          totalTextInputs: sql<number>`coalesce(sum(${eventBatches.textInputs}), 0)::int`,
          totalScrolls: sql<number>`coalesce(sum(${eventBatches.scrolls}), 0)::int`,
          totalAppSwitches: sql<number>`coalesce(sum(${eventBatches.appSwitches}), 0)::int`,
        })
        .from(eventBatches)
        .where(eq(eventBatches.hackathonId, id))
        .groupBy(eventBatches.teamId),

      // Latest foreground app per team (limit to recent for speed)
      db
        .select({
          teamId: eventBatches.teamId,
          foregroundApp: eventBatches.foregroundApp,
        })
        .from(eventBatches)
        .where(eq(eventBatches.hackathonId, id))
        .orderBy(desc(eventBatches.periodEnd))
        .limit(teamIds.length * 2),

      // Camera opens count
      db
        .select({
          teamId: cameraEvents.teamId,
          count: sql<number>`count(*)::int`,
        })
        .from(cameraEvents)
        .where(eq(cameraEvents.hackathonId, id))
        .groupBy(cameraEvents.teamId),

      // Heartbeats
      db.select().from(heartbeats).where(eq(heartbeats.hackathonId, id)),
    ]);

    // Build lookup maps
    const batchMap = new Map(batchTotals.map((b) => [b.teamId, b]));
    const cameraMap = new Map(cameraOpens.map((c) => [c.teamId, c.count]));

    // Keep only the most recent heartbeat per team
    const heartbeatMap = new Map<string, typeof heartbeatRows[0]>();
    for (const h of heartbeatRows) {
      const existing = heartbeatMap.get(h.teamId);
      if (!existing || (h.lastSeen && (!existing.lastSeen || new Date(h.lastSeen) > new Date(existing.lastSeen)))) {
        heartbeatMap.set(h.teamId, h);
      }
    }

    const latestAppMap = new Map<string, string | null>();
    for (const b of latestBatches) {
      if (!latestAppMap.has(b.teamId)) {
        latestAppMap.set(b.teamId, b.foregroundApp);
      }
    }

    const now = Date.now();

    const result = teamRows.map((team) => {
      const batch = batchMap.get(team.id);
      const hb = heartbeatMap.get(team.id);
      const lastSeen = hb?.lastSeen ? new Date(hb.lastSeen).getTime() : 0;
      const ageSec = (now - lastSeen) / 1000;

      let status = "offline";
      if (ageSec < 60) status = "active";
      else if (ageSec < 300) status = "idle";

      return {
        team_id: team.id,
        team_name: team.name,
        device_id: team.deviceId,
        total_taps: batch?.totalTaps ?? 0,
        total_text_inputs: batch?.totalTextInputs ?? 0,
        total_scrolls: batch?.totalScrolls ?? 0,
        total_app_switches: batch?.totalAppSwitches ?? 0,
        current_app: latestAppMap.get(team.id) ?? null,
        camera_opens: cameraMap.get(team.id) ?? 0,
        last_heartbeat: hb?.lastSeen ?? null,
        battery_level: hb?.batteryLevel ?? null,
        status,
      };
    });

    return NextResponse.json({
      teams: result,
      server_time: new Date().toISOString(),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
