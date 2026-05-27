export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { teams, teamMembers, heartbeats } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [teamRows, heartbeatRows, memberRows] = await Promise.all([
      db.select().from(teams).where(eq(teams.hackathonId, id)),
      db.select().from(heartbeats).where(eq(heartbeats.hackathonId, id)),
      db
        .select({
          teamId: teamMembers.teamId,
          deviceId: teamMembers.deviceId,
          slot: teamMembers.slot,
          memberName: teamMembers.memberName,
        })
        .from(teamMembers)
        .where(eq(teamMembers.hackathonId, id))
        .orderBy(asc(teamMembers.slot)),
    ]);

    // Latest heartbeat per device — needed so the manage table can show
    // per-member "last seen" + battery instead of a single team-level signal.
    const heartbeatByDevice = new Map<string, typeof heartbeatRows[number]>();
    for (const h of heartbeatRows) {
      const key = `${h.teamId} ${h.deviceId}`;
      const existing = heartbeatByDevice.get(key);
      if (
        !existing ||
        (h.lastSeen && new Date(h.lastSeen) > new Date(existing.lastSeen))
      ) {
        heartbeatByDevice.set(key, h);
      }
    }

    const heartbeatByTeam = new Map<string, typeof heartbeatRows[number]>();
    for (const h of heartbeatRows) {
      const existing = heartbeatByTeam.get(h.teamId);
      if (
        !existing ||
        (h.lastSeen && new Date(h.lastSeen) > new Date(existing.lastSeen))
      ) {
        heartbeatByTeam.set(h.teamId, h);
      }
    }

    const membersByTeam = new Map<string, typeof memberRows>();
    for (const m of memberRows) {
      const list = membersByTeam.get(m.teamId) ?? [];
      list.push(m);
      membersByTeam.set(m.teamId, list);
    }

    const now = Date.now();
    const result = teamRows.map((team) => {
      const hb = heartbeatByTeam.get(team.id);
      const lastSeen = hb?.lastSeen ? new Date(hb.lastSeen).getTime() : 0;
      const ageSec = (now - lastSeen) / 1000;

      let status = "offline";
      if (ageSec < 60) status = "active";
      else if (ageSec < 300) status = "idle";

      const members = (membersByTeam.get(team.id) ?? []).map((m) => {
        const mhb = heartbeatByDevice.get(`${team.id} ${m.deviceId}`);
        const mAge = mhb?.lastSeen
          ? (now - new Date(mhb.lastSeen).getTime()) / 1000
          : Infinity;
        return {
          slot: m.slot,
          memberName: m.memberName,
          deviceId: m.deviceId,
          online: mAge < 60,
          lastHeartbeat: mhb?.lastSeen ?? null,
          batteryLevel: mhb?.batteryLevel ?? null,
        };
      });

      return {
        ...team,
        lastHeartbeat: hb?.lastSeen ?? null,
        batteryLevel: hb?.batteryLevel ?? null,
        status,
        members,
      };
    });

    return NextResponse.json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
