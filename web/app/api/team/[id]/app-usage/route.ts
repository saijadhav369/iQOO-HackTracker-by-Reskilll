export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { appUsage, teamMembers } from "@/lib/db/schema";
import { asc, eq, sql } from "drizzle-orm";

// Per-app foreground minutes summed across UsageStats snapshots for this team.
// Now returns one row per (deviceId, appPackage) so the team detail page can
// filter the pie chart by member. The Team tab on the dashboard sums all
// devices' rows on the client.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [rows, members] = await Promise.all([
      db
        .select({
          deviceId: appUsage.deviceId,
          appPackage: appUsage.appPackage,
          appLabel: sql<string | null>`max(${appUsage.appLabel})`,
          foregroundMinutes: sql<number>`coalesce(sum(${appUsage.foregroundMinutes}), 0)::real`,
        })
        .from(appUsage)
        .where(eq(appUsage.teamId, id))
        .groupBy(appUsage.deviceId, appUsage.appPackage)
        .orderBy(sql`coalesce(sum(${appUsage.foregroundMinutes}), 0) desc`),
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
