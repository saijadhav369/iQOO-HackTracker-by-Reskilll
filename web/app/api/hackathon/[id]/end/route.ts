import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  hackathons,
  teams,
  eventBatches,
  appUsage,
  cameraEvents,
  clipboardEvents,
  reports,
} from "@/lib/db/schema";
import { getSession } from "@/lib/auth/jwt";
import { eq, sql } from "drizzle-orm";

async function generateReport(teamId: string, hackathonId: string) {
  const batchTotals = await db
    .select({
      totalTaps: sql<number>`coalesce(sum(${eventBatches.taps}), 0)::int`,
      totalTextInputs: sql<number>`coalesce(sum(${eventBatches.textInputs}), 0)::int`,
      totalScrolls: sql<number>`coalesce(sum(${eventBatches.scrolls}), 0)::int`,
      totalAppSwitches: sql<number>`coalesce(sum(${eventBatches.appSwitches}), 0)::int`,
    })
    .from(eventBatches)
    .where(eq(eventBatches.teamId, teamId));

  const topApps = await db
    .select({
      appPackage: appUsage.appPackage,
      appLabel: appUsage.appLabel,
      minutes: sql<number>`coalesce(sum(${appUsage.foregroundMinutes}), 0)::real`,
    })
    .from(appUsage)
    .where(eq(appUsage.teamId, teamId))
    .groupBy(appUsage.appPackage, appUsage.appLabel)
    .orderBy(sql`sum(${appUsage.foregroundMinutes}) desc`)
    .limit(10);

  const cameraCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(cameraEvents)
    .where(eq(cameraEvents.teamId, teamId));

  const clipboardCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(clipboardEvents)
    .where(eq(clipboardEvents.teamId, teamId));

  // Hourly timeline
  const timeline = await db
    .select({
      hour: sql<string>`to_char(${eventBatches.periodStart}, 'HH24:00')`,
      taps: sql<number>`coalesce(sum(${eventBatches.taps}), 0)::int`,
    })
    .from(eventBatches)
    .where(eq(eventBatches.teamId, teamId))
    .groupBy(sql`to_char(${eventBatches.periodStart}, 'HH24:00')`)
    .orderBy(sql`to_char(${eventBatches.periodStart}, 'HH24:00')`);

  const totals = batchTotals[0];
  const totalScreenMinutes = topApps.reduce((sum, a) => sum + a.minutes, 0);

  return {
    team_id: teamId,
    hackathon_id: hackathonId,
    summary: {
      total_taps: totals?.totalTaps ?? 0,
      total_text_inputs: totals?.totalTextInputs ?? 0,
      total_scrolls: totals?.totalScrolls ?? 0,
      total_app_switches: totals?.totalAppSwitches ?? 0,
      total_screen_on_minutes: Math.round(totalScreenMinutes),
      total_camera_opens: cameraCount[0]?.count ?? 0,
      total_clipboard_events: clipboardCount[0]?.count ?? 0,
    },
    top_apps: topApps.map((a) => ({
      package: a.appPackage,
      label: a.appLabel,
      minutes: Math.round(a.minutes * 10) / 10,
    })),
    activity_timeline: timeline.map((t) => ({
      hour: t.hour,
      taps: t.taps,
    })),
  };
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const [updated] = await db
      .update(hackathons)
      .set({ status: "ended" })
      .where(eq(hackathons.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: "Hackathon not found" },
        { status: 404 }
      );
    }

    // Generate reports for all teams
    const teamRows = await db
      .select()
      .from(teams)
      .where(eq(teams.hackathonId, id));

    const generatedReports = [];
    for (const team of teamRows) {
      const reportJson = await generateReport(team.id, id);
      const [saved] = await db
        .insert(reports)
        .values({
          teamId: team.id,
          hackathonId: id,
          reportJson,
        })
        .returning();
      generatedReports.push(saved);
    }

    return NextResponse.json({
      hackathon: updated,
      reports_generated: generatedReports.length,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
