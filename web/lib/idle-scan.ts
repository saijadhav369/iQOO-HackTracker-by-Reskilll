import { db } from "@/lib/db";
import {
  hackathons,
  teams,
  heartbeats,
  eventBatches,
  notifications,
  organiserAlerts,
} from "@/lib/db/schema";
import { and, desc, eq, gt, sql } from "drizzle-orm";

const IDLE_WINDOW_MS = 10 * 60 * 1000; // 10 min — tap window + dedupe window
const HEARTBEAT_ONLINE_MS = 60 * 1000; // <60s = device is online

export interface IdleScanResult {
  scanned: number;
  alerted: number;
  skipped_reason?: string;
}

/**
 * Idle-during-Red-light scan for a single hackathon. Red-light only. Flags teams
 * that are online (fresh heartbeat) but have logged zero taps in the last 10 min,
 * enqueuing a phone notification + an organiser alert (deduped per 10 min).
 *
 * Shared by the dashboard-polled route and the Railway cron sweep.
 */
export async function scanIdleForHackathon(id: string): Promise<IdleScanResult> {
  const [hk] = await db
    .select({ currentLight: hackathons.currentLight })
    .from(hackathons)
    .where(eq(hackathons.id, id))
    .limit(1);

  if (!hk) return { scanned: 0, alerted: 0, skipped_reason: "not_found" };
  if (hk.currentLight !== "red") {
    return { scanned: 0, alerted: 0, skipped_reason: "not_red" };
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() - IDLE_WINDOW_MS);
  const heartbeatCutoff = new Date(now.getTime() - HEARTBEAT_ONLINE_MS);

  const teamRows = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.hackathonId, id));

  if (teamRows.length === 0) return { scanned: 0, alerted: 0 };

  const heartbeatRows = await db
    .select({ teamId: heartbeats.teamId, lastSeen: heartbeats.lastSeen })
    .from(heartbeats)
    .where(eq(heartbeats.hackathonId, id));

  const latestHeartbeat = new Map<string, Date>();
  for (const h of heartbeatRows) {
    const t = h.lastSeen ? new Date(h.lastSeen) : null;
    if (!t) continue;
    const existing = latestHeartbeat.get(h.teamId);
    if (!existing || t > existing) latestHeartbeat.set(h.teamId, t);
  }

  const recentTapRows = await db
    .select({
      teamId: eventBatches.teamId,
      taps: sql<number>`coalesce(sum(${eventBatches.taps}), 0)::int`,
    })
    .from(eventBatches)
    .where(
      and(
        eq(eventBatches.hackathonId, id),
        gt(eventBatches.periodEnd, windowStart)
      )
    )
    .groupBy(eventBatches.teamId);

  const recentTaps = new Map(recentTapRows.map((r) => [r.teamId, r.taps]));

  let alerted = 0;

  for (const team of teamRows) {
    const lastSeen = latestHeartbeat.get(team.id);
    if (!lastSeen || lastSeen < heartbeatCutoff) continue; // not online
    if ((recentTaps.get(team.id) ?? 0) > 0) continue; // not idle

    const recentAlert = await db
      .select({ id: organiserAlerts.id })
      .from(organiserAlerts)
      .where(
        and(
          eq(organiserAlerts.teamId, team.id),
          eq(organiserAlerts.type, "idle_warning"),
          gt(organiserAlerts.createdAt, windowStart)
        )
      )
      .orderBy(desc(organiserAlerts.createdAt))
      .limit(1);

    if (recentAlert.length > 0) continue;

    const title = "Idle during Red light";
    const message = "You've been idle 10 min. Pick up the phone.";

    await db.insert(notifications).values({
      hackathonId: id,
      title,
      message,
      targetFilter: "custom",
      targetTeamIds: [team.id],
    });

    await db.insert(organiserAlerts).values({
      hackathonId: id,
      teamId: team.id,
      type: "idle_warning",
      message,
    });

    alerted++;
  }

  return { scanned: teamRows.length, alerted };
}

/** Sweep every active hackathon currently on the Red light. */
export async function scanAllActiveHackathons(): Promise<{
  hackathons: number;
  scanned: number;
  alerted: number;
}> {
  const active = await db
    .select({ id: hackathons.id })
    .from(hackathons)
    .where(
      and(eq(hackathons.status, "active"), eq(hackathons.currentLight, "red"))
    );

  let scanned = 0;
  let alerted = 0;
  for (const h of active) {
    const r = await scanIdleForHackathon(h.id);
    scanned += r.scanned;
    alerted += r.alerted;
  }
  return { hackathons: active.length, scanned, alerted };
}
