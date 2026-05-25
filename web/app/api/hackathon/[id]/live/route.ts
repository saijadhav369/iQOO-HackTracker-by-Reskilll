import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  teams,
  eventBatches,
  heartbeats,
  cameraEvents,
  hackathons,
  deviceVitals,
  tamperEvents,
} from "@/lib/db/schema";
import { eq, sql, desc, asc, isNull, and } from "drizzle-orm";
import { computeLongestSessionMsPerTeam } from "@/lib/sessions";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Single query: teams + aggregated batches
    const teamRows = await db.select().from(teams).where(eq(teams.hackathonId, id));

    const [hk] = await db
      .select({
        currentLight: hackathons.currentLight,
        lightChangedAt: hackathons.lightChangedAt,
      })
      .from(hackathons)
      .where(eq(hackathons.id, id))
      .limit(1);
    const currentLight = hk?.currentLight ?? "green";
    const lightChangedAt = hk?.lightChangedAt ?? null;

    if (teamRows.length === 0) {
      return NextResponse.json({
        teams: [],
        current_light: currentLight,
        light_changed_at: lightChangedAt,
        server_time: new Date().toISOString(),
      });
    }

    const teamIds = teamRows.map((t) => t.id);

    // Run remaining queries in parallel
    const [batchTotals, latestBatches, cameraOpens, heartbeatRows, vitalTicks, tamperCounts] = await Promise.all([
      // Aggregate totals per team
      db
        .select({
          teamId: eventBatches.teamId,
          totalTaps: sql<number>`coalesce(sum(${eventBatches.taps}), 0)::int`,
          totalTextInputs: sql<number>`coalesce(sum(${eventBatches.textInputs}), 0)::int`,
          totalScrolls: sql<number>`coalesce(sum(${eventBatches.scrolls}), 0)::int`,
          totalAppSwitches: sql<number>`coalesce(sum(${eventBatches.appSwitches}), 0)::int`,
          totalKeyboardSeconds: sql<number>`coalesce(sum(${eventBatches.keyboardActiveSeconds}), 0)::int`,
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

      // Per-heartbeat trail (one row per ~30s) for session computation
      db
        .select({
          teamId: deviceVitals.teamId,
          recordedAt: deviceVitals.recordedAt,
        })
        .from(deviceVitals)
        .where(eq(deviceVitals.hackathonId, id))
        .orderBy(asc(deviceVitals.teamId), asc(deviceVitals.recordedAt)),

      // Unresolved tamper events per team → red ⚠ badge on the team card.
      // Isolated in its own try/catch so a missing/unmigrated tamper_events
      // table degrades to zero badges instead of 500-ing the whole live grid.
      (async () => {
        try {
          return await db
            .select({
              teamId: tamperEvents.teamId,
              count: sql<number>`count(*)::int`,
            })
            .from(tamperEvents)
            .where(
              and(
                eq(tamperEvents.hackathonId, id),
                isNull(tamperEvents.resolvedAt)
              )
            )
            .groupBy(tamperEvents.teamId);
        } catch {
          return [] as { teamId: string; count: number }[];
        }
      })(),
    ]);

    const longestSessionMsMap = computeLongestSessionMsPerTeam(vitalTicks);

    // Build lookup maps
    const batchMap = new Map(batchTotals.map((b) => [b.teamId, b]));
    const cameraMap = new Map(cameraOpens.map((c) => [c.teamId, c.count]));
    const tamperMap = new Map(tamperCounts.map((t) => [t.teamId, t.count]));

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

      // heartbeat-dead (>300s) splits into crashed (dirty exit) vs offline (clean exit).
      // last_clean_exit defaults true, so absent/never-connected devices read as offline.
      let status: "active" | "idle" | "offline" | "crashed" = "offline";
      if (ageSec < 60) status = "active";
      else if (ageSec < 300) status = "idle";
      else status = hb?.lastCleanExit === false ? "crashed" : "offline";

      return {
        team_id: team.id,
        team_name: team.name,
        device_id: team.deviceId,
        total_taps: batch?.totalTaps ?? 0,
        total_text_inputs: batch?.totalTextInputs ?? 0,
        total_scrolls: batch?.totalScrolls ?? 0,
        total_app_switches: batch?.totalAppSwitches ?? 0,
        total_keyboard_seconds: batch?.totalKeyboardSeconds ?? 0,
        current_app: latestAppMap.get(team.id) ?? null,
        camera_opens: cameraMap.get(team.id) ?? 0,
        last_heartbeat: hb?.lastSeen ?? null,
        battery_level: hb?.batteryLevel ?? null,
        longest_continuous_session_minutes: Math.round(
          (longestSessionMsMap.get(team.id) ?? 0) / 60000
        ),
        tamper_count: tamperMap.get(team.id) ?? 0,
        status,
      };
    });

    return NextResponse.json({
      teams: result,
      current_light: currentLight,
      light_changed_at: lightChangedAt,
      server_time: new Date().toISOString(),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
