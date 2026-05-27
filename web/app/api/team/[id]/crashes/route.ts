export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { crashLogs, teamMembers } from "@/lib/db/schema";
import { asc, desc, eq } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [rows, members] = await Promise.all([
      db
        .select({
          id: crashLogs.id,
          deviceId: crashLogs.deviceId,
          occurredAt: crashLogs.occurredAt,
          threadName: crashLogs.threadName,
          stacktrace: crashLogs.stacktrace,
          foregroundApp: crashLogs.foregroundApp,
          reason: crashLogs.reason,
        })
        .from(crashLogs)
        .where(eq(crashLogs.teamId, id))
        .orderBy(desc(crashLogs.occurredAt))
        .limit(200),
      db
        .select({
          deviceId: teamMembers.deviceId,
          slot: teamMembers.slot,
          memberName: teamMembers.memberName,
        })
        .from(teamMembers)
        .where(eq(teamMembers.teamId, id))
        .orderBy(asc(teamMembers.slot)),
    ]);

    return NextResponse.json({ members, rows });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
