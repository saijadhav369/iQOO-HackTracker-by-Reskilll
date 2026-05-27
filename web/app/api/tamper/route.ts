export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tamperEvents } from "@/lib/db/schema";
import { tamperBatchSchema } from "@/lib/validators";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = tamperBatchSchema.parse(body);

    if (data.events.length === 0) {
      return NextResponse.json({ success: true, inserted: 0 });
    }

    const rows = data.events.map((e) => ({
      teamId: e.team_id,
      hackathonId: e.hackathon_id,
      deviceId: e.device_id,
      type: e.type,
      detail: e.detail ?? null,
      occurredAt: new Date(e.occurred_at),
    }));

    await db.insert(tamperEvents).values(rows);

    return NextResponse.json({ success: true, inserted: rows.length });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
