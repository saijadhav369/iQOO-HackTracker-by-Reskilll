export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { appUsage } from "@/lib/db/schema";
import { usageSnapshotSchema } from "@/lib/validators";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = usageSnapshotSchema.parse(body);

    const rows = data.apps.map((app) => ({
      teamId: data.team_id,
      hackathonId: data.hackathon_id,
      snapshotTime: new Date(data.snapshot_time),
      appPackage: app.package,
      appLabel: app.label ?? null,
      foregroundMinutes: app.foreground_minutes,
      openCount: app.open_count,
    }));

    if (rows.length > 0) {
      await db.insert(appUsage).values(rows);
    }

    return NextResponse.json({ success: true, count: rows.length });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
