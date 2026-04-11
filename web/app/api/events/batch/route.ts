export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eventBatches } from "@/lib/db/schema";
import { eventBatchSchema } from "@/lib/validators";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = eventBatchSchema.parse(body);

    const [row] = await db
      .insert(eventBatches)
      .values({
        teamId: data.team_id,
        hackathonId: data.hackathon_id,
        deviceId: data.device_id,
        periodStart: new Date(data.period_start),
        periodEnd: new Date(data.period_end),
        taps: data.events.taps,
        textInputs: data.events.text_inputs,
        scrolls: data.events.scrolls,
        appSwitches: data.events.app_switches,
        perAppTaps: data.per_app_taps ?? null,
        foregroundApp: data.foreground_app ?? null,
      })
      .returning({ id: eventBatches.id });

    return NextResponse.json({ success: true, id: row.id });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
