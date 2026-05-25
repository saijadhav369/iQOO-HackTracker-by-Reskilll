export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cameraEvents, clipboardEvents } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

// Per-team counts of discrete events that don't fit the timeline batches.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [[camera], [clipboard]] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(cameraEvents)
        .where(eq(cameraEvents.teamId, id)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(clipboardEvents)
        .where(eq(clipboardEvents.teamId, id)),
    ]);

    return NextResponse.json({
      cameraOpens: camera?.count ?? 0,
      clipboardEvents: clipboard?.count ?? 0,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
