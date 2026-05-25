export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tamperEvents } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const rows = await db
      .select({
        id: tamperEvents.id,
        type: tamperEvents.type,
        detail: tamperEvents.detail,
        occurredAt: tamperEvents.occurredAt,
        resolvedAt: tamperEvents.resolvedAt,
      })
      .from(tamperEvents)
      .where(eq(tamperEvents.teamId, id))
      .orderBy(desc(tamperEvents.occurredAt))
      .limit(200);

    return NextResponse.json(rows);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
