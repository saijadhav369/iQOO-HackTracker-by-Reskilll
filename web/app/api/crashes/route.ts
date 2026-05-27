export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { crashLogs } from "@/lib/db/schema";
import { crashLogBatchSchema } from "@/lib/validators";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = crashLogBatchSchema.parse(body);

    if (data.crashes.length === 0) {
      return NextResponse.json({ success: true, inserted: 0 });
    }

    const rows = data.crashes.map((c) => ({
      teamId: c.team_id,
      hackathonId: c.hackathon_id,
      deviceId: c.device_id,
      occurredAt: new Date(c.occurred_at),
      threadName: c.thread_name ?? null,
      stacktrace: c.stacktrace ?? null,
      foregroundApp: c.foreground_app ?? null,
      reason: c.reason ?? null,
    }));

    await db.insert(crashLogs).values(rows);

    return NextResponse.json({ success: true, inserted: rows.length });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
