import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { heartbeats, notifications, eventBatches, deviceVitals } from "@/lib/db/schema";
import { heartbeatSchema } from "@/lib/validators";
import { eq, and, gt, sql, desc } from "drizzle-orm";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = heartbeatSchema.parse(body);
    const now = new Date();

    // Upsert heartbeat
    const existing = await db
      .select({ id: heartbeats.id })
      .from(heartbeats)
      .where(
        and(
          eq(heartbeats.deviceId, data.device_id),
          eq(heartbeats.hackathonId, data.hackathon_id)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(heartbeats)
        .set({
          lastSeen: now,
          batteryLevel: data.battery_level ?? null,
          temperature: data.temperature ?? null,
        })
        .where(eq(heartbeats.id, existing[0].id));
    } else {
      await db.insert(heartbeats).values({
        teamId: data.team_id,
        hackathonId: data.hackathon_id,
        deviceId: data.device_id,
        lastSeen: now,
        batteryLevel: data.battery_level ?? null,
        temperature: data.temperature ?? null,
      });
    }

    // Store vitals history (every heartbeat = ~30s intervals)
    if (data.battery_level != null || data.temperature != null || data.cpu_usage != null) {
      await db.insert(deviceVitals).values({
        teamId: data.team_id,
        hackathonId: data.hackathon_id,
        recordedAt: now,
        batteryLevel: data.battery_level ?? null,
        temperature: data.temperature ?? null,
        cpuUsage: data.cpu_usage ?? null,
      });
    }

    // Get last seen notification id
    const lastSeenId = data.last_notification_id ?? 0;

    // Fetch notifications newer than what device has seen
    const newNotifications = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.hackathonId, data.hackathon_id),
          gt(notifications.id, lastSeenId)
        )
      )
      .orderBy(desc(notifications.createdAt))
      .limit(10);

    // Filter notifications by target
    const teamTotalTaps = await db
      .select({
        total: sql<number>`coalesce(sum(${eventBatches.taps}), 0)::int`,
      })
      .from(eventBatches)
      .where(eq(eventBatches.teamId, data.team_id));

    const taps = teamTotalTaps[0]?.total ?? 0;

    // Check heartbeat age for status
    const applicableNotifs = newNotifications.filter((n) => {
      switch (n.targetFilter) {
        case "all":
          return true;
        case "active":
          return true; // device is sending heartbeat, so it's active
        case "idle":
          return false; // can't self-identify as idle
        case "low_taps":
          return n.targetMaxTaps != null && taps <= n.targetMaxTaps;
        case "high_taps":
          return n.targetMinTaps != null && taps >= n.targetMinTaps;
        case "custom":
          return (n.targetTeamIds as string[] | null)?.includes(data.team_id) ?? false;
        default:
          return true;
      }
    });

    return NextResponse.json({
      success: true,
      server_time: now.toISOString(),
      notifications: applicableNotifs.map((n) => ({
        id: n.id,
        title: n.title,
        message: n.message,
        created_at: n.createdAt,
      })),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
