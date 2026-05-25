export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organiserAlerts, teams } from "@/lib/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const hackathonId = req.nextUrl.searchParams.get("hackathonId");
    if (!hackathonId) {
      return NextResponse.json({ error: "hackathonId required" }, { status: 400 });
    }

    const rows = await db
      .select({
        id: organiserAlerts.id,
        hackathonId: organiserAlerts.hackathonId,
        teamId: organiserAlerts.teamId,
        teamName: teams.name,
        type: organiserAlerts.type,
        message: organiserAlerts.message,
        createdAt: organiserAlerts.createdAt,
      })
      .from(organiserAlerts)
      .innerJoin(teams, eq(teams.id, organiserAlerts.teamId))
      .where(
        and(
          eq(organiserAlerts.hackathonId, hackathonId),
          isNull(organiserAlerts.dismissedAt)
        )
      )
      .orderBy(desc(organiserAlerts.createdAt))
      .limit(100);

    return NextResponse.json(rows);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
