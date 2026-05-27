export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { heartbeats, notifications, eventBatches, deviceVitals, hackathons, screenshotRequests } from "@/lib/db/schema";
import { heartbeatSchema } from "@/lib/validators";
import { eq, and, gt, sql, desc, asc, or, isNull } from "drizzle-orm";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = heartbeatSchema.parse(body);
    const now = new Date();
    // TEMP debug — confirm where the phone is heartbeating (localhost vs Railway)
    console.log(`[HB] ${now.toISOString()} device=${data.device_id} team=${data.team_id} ua=${req.headers.get("user-agent") ?? "?"} xfwd=${req.headers.get("x-forwarded-for") ?? "?"}`);

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

    // clean_exit is optional + defaults to true so old APKs keep working.
    const cleanExit = data.clean_exit ?? true;

    if (existing.length > 0) {
      await db
        .update(heartbeats)
        .set({
          lastSeen: now,
          batteryLevel: data.battery_level ?? null,
          temperature: data.temperature ?? null,
          lastCleanExit: cleanExit,
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
        lastCleanExit: cleanExit,
      });
    }

    // Store vitals history. The phone heartbeats at 5s for fast screenshot
    // pickup, but vitals at that cadence would 6× the row count for no
    // observable benefit — throttle to ≥25s between inserts per team.
    if (
      data.battery_level != null ||
      data.temperature != null ||
      data.cpu_usage != null ||
      data.thermal_headroom != null ||
      data.thermal_status != null ||
      data.monster_mode != null ||
      data.mem_available_mb != null ||
      data.mem_total_mb != null ||
      data.is_charging != null ||
      data.charging_type != null ||
      data.network_type != null ||
      data.cellular_dbm != null ||
      data.wifi_rssi != null ||
      data.data_rx_mb_since_boot != null ||
      data.data_tx_mb_since_boot != null
    ) {
      // Throttle per-(team, device): with multi-phone teams, throttling at the
      // team level would let one phone's heartbeat suppress another's vitals
      // insert for 25s. We want one row per phone per 25s.
      const [latestVital] = await db
        .select({ recordedAt: deviceVitals.recordedAt })
        .from(deviceVitals)
        .where(
          and(
            eq(deviceVitals.teamId, data.team_id),
            eq(deviceVitals.deviceId, data.device_id)
          )
        )
        .orderBy(desc(deviceVitals.recordedAt))
        .limit(1);
      const lastTs = latestVital?.recordedAt
        ? new Date(latestVital.recordedAt).getTime()
        : 0;
      if (!lastTs || now.getTime() - lastTs >= 25_000) {
        await db.insert(deviceVitals).values({
          teamId: data.team_id,
          hackathonId: data.hackathon_id,
          deviceId: data.device_id,
          recordedAt: now,
          batteryLevel: data.battery_level ?? null,
          temperature: data.temperature ?? null,
          cpuUsage: data.cpu_usage ?? null,
          thermalHeadroom: data.thermal_headroom ?? null,
          thermalStatus: data.thermal_status ?? null,
          monsterMode: data.monster_mode ?? null,
          memAvailableMb: data.mem_available_mb ?? null,
          memTotalMb: data.mem_total_mb ?? null,
          isCharging: data.is_charging ?? null,
          chargingType: data.charging_type ?? null,
          networkType: data.network_type ?? null,
          cellularDbm: data.cellular_dbm ?? null,
          wifiRssi: data.wifi_rssi ?? null,
          dataRxMb: data.data_rx_mb_since_boot ?? null,
          dataTxMb: data.data_tx_mb_since_boot ?? null,
        });
      }
    }

    // Fetch hackathon light state (venue signal, not enforcement)
    const [hk] = await db
      .select({ currentLight: hackathons.currentLight })
      .from(hackathons)
      .where(eq(hackathons.id, data.hackathon_id))
      .limit(1);
    const currentLight = hk?.currentLight ?? "green";

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

    // Oldest pending screenshot for this team → device picks it up next tick.
    // Multi-phone teams: a request can be pinned to a specific device_id.
    // We only pick up requests that are EITHER (a) untargeted (legacy team-
    // wide requests) OR (b) targeted at this exact device. Other members'
    // pending requests are filtered out.
    const [pendingShot] = await db
      .select({ id: screenshotRequests.id })
      .from(screenshotRequests)
      .where(
        and(
          eq(screenshotRequests.teamId, data.team_id),
          eq(screenshotRequests.status, "pending"),
          or(
            isNull(screenshotRequests.deviceId),
            eq(screenshotRequests.deviceId, data.device_id)
          )
        )
      )
      .orderBy(asc(screenshotRequests.requestedAt))
      .limit(1);

    return NextResponse.json({
      success: true,
      server_time: now.toISOString(),
      current_light: currentLight,
      pending_screenshot_id: pendingShot?.id ?? null,
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
