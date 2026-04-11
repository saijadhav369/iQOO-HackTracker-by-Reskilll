export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { teams, heartbeats } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const teamRows = await db
      .select()
      .from(teams)
      .where(eq(teams.hackathonId, id));

    const heartbeatRows = await db
      .select()
      .from(heartbeats)
      .where(eq(heartbeats.hackathonId, id));

    const heartbeatMap = new Map(
      heartbeatRows.map((h) => [h.teamId, h])
    );

    const now = Date.now();
    const result = teamRows.map((team) => {
      const hb = heartbeatMap.get(team.id);
      const lastSeen = hb?.lastSeen ? new Date(hb.lastSeen).getTime() : 0;
      const ageSec = (now - lastSeen) / 1000;

      let status = "offline";
      if (ageSec < 60) status = "active";
      else if (ageSec < 300) status = "idle";

      return {
        ...team,
        lastHeartbeat: hb?.lastSeen ?? null,
        batteryLevel: hb?.batteryLevel ?? null,
        status,
      };
    });

    return NextResponse.json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
