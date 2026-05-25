export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { screenshotRequests } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: teamId } = await params;
    const rows = await db
      .select()
      .from(screenshotRequests)
      .where(eq(screenshotRequests.teamId, teamId))
      .orderBy(desc(screenshotRequests.requestedAt))
      .limit(60);

    return NextResponse.json(rows);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
