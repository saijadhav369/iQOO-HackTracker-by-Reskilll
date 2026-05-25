export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { crashLogs } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const rows = await db
      .select({
        id: crashLogs.id,
        occurredAt: crashLogs.occurredAt,
        threadName: crashLogs.threadName,
        stacktrace: crashLogs.stacktrace,
        foregroundApp: crashLogs.foregroundApp,
        reason: crashLogs.reason,
      })
      .from(crashLogs)
      .where(eq(crashLogs.teamId, id))
      .orderBy(desc(crashLogs.occurredAt))
      .limit(200);

    return NextResponse.json(rows);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
