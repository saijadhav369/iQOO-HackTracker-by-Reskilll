export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cameraEvents } from "@/lib/db/schema";
import { cameraEventSchema } from "@/lib/validators";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = cameraEventSchema.parse(body);

    const [row] = await db
      .insert(cameraEvents)
      .values({
        teamId: data.team_id,
        hackathonId: data.hackathon_id,
        eventTime: new Date(data.event_time),
        eventType: data.event_type,
      })
      .returning({ id: cameraEvents.id });

    return NextResponse.json({ success: true, id: row.id });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
