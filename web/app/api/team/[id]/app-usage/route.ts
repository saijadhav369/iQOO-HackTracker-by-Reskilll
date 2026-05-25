export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { appUsage } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

// Aggregated per-app foreground minutes from the UsageStats snapshots.
// One row per package, summed across every snapshot for this team.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const rows = await db
      .select({
        appPackage: appUsage.appPackage,
        appLabel: sql<string | null>`max(${appUsage.appLabel})`,
        foregroundMinutes: sql<number>`coalesce(sum(${appUsage.foregroundMinutes}), 0)::real`,
      })
      .from(appUsage)
      .where(eq(appUsage.teamId, id))
      .groupBy(appUsage.appPackage)
      .orderBy(sql`coalesce(sum(${appUsage.foregroundMinutes}), 0) desc`);

    return NextResponse.json(rows);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
