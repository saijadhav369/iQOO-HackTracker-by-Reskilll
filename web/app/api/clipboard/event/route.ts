export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clipboardEvents } from "@/lib/db/schema";
import { clipboardEventSchema } from "@/lib/validators";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = clipboardEventSchema.parse(body);

    const [row] = await db
      .insert(clipboardEvents)
      .values({
        teamId: data.team_id,
        hackathonId: data.hackathon_id,
        deviceId: data.device_id,
        eventTime: new Date(data.event_time),
      })
      .returning({ id: clipboardEvents.id });

    return NextResponse.json({ success: true, id: row.id });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
