export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { teams, eventBatches, appUsage, cameraEvents } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const batchTotals = await db
      .select({
        teamId: eventBatches.teamId,
        totalTaps: sql<number>`coalesce(sum(${eventBatches.taps}), 0)::int`,
        totalTextInputs: sql<number>`coalesce(sum(${eventBatches.textInputs}), 0)::int`,
        totalScrolls: sql<number>`coalesce(sum(${eventBatches.scrolls}), 0)::int`,
        totalAppSwitches: sql<number>`coalesce(sum(${eventBatches.appSwitches}), 0)::int`,
      })
      .from(eventBatches)
      .where(eq(eventBatches.hackathonId, id))
      .groupBy(eventBatches.teamId);

    const officeKitUsage = await db
      .select({
        teamId: appUsage.teamId,
        minutes: sql<number>`coalesce(sum(${appUsage.foregroundMinutes}), 0)::real`,
      })
      .from(appUsage)
      .where(eq(appUsage.hackathonId, id))
      .groupBy(appUsage.teamId);

    const cameraOpens = await db
      .select({
        teamId: cameraEvents.teamId,
        count: sql<number>`count(*)::int`,
      })
      .from(cameraEvents)
      .where(eq(cameraEvents.hackathonId, id))
      .groupBy(cameraEvents.teamId);

    const teamRows = await db
      .select()
      .from(teams)
      .where(eq(teams.hackathonId, id));

    const batchMap = new Map(batchTotals.map((b) => [b.teamId, b]));
    const officeMap = new Map(officeKitUsage.map((o) => [o.teamId, o.minutes]));
    const cameraMap = new Map(cameraOpens.map((c) => [c.teamId, c.count]));

    const leaderboard = teamRows
      .map((team) => {
        const batch = batchMap.get(team.id);
        return {
          team_id: team.id,
          team_name: team.name,
          total_taps: batch?.totalTaps ?? 0,
          total_text_inputs: batch?.totalTextInputs ?? 0,
          total_scrolls: batch?.totalScrolls ?? 0,
          total_app_switches: batch?.totalAppSwitches ?? 0,
          office_kit_minutes: officeMap.get(team.id) ?? 0,
          camera_opens: cameraMap.get(team.id) ?? 0,
        };
      })
      .sort((a, b) => b.total_taps - a.total_taps);

    return NextResponse.json(leaderboard);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
