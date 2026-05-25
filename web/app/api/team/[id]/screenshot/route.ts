export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { screenshotRequests, teams } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/jwt";
import { and, asc, eq } from "drizzle-orm";

// Organiser-only: create a pending screen-capture request for a team. The
// device picks it up on its next heartbeat (≤5s) and uploads to /api/screenshots.
//
// Coalesces rapid clicks: if a pending row already exists for this team, that
// row is returned instead of inserting a duplicate — otherwise the queue
// balloons every time the organiser fat-fingers the button.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: teamId } = await params;

    const [team] = await db
      .select()
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    if (team.hackathonId !== session.hackathonId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [existing] = await db
      .select({ id: screenshotRequests.id, status: screenshotRequests.status })
      .from(screenshotRequests)
      .where(
        and(
          eq(screenshotRequests.teamId, team.id),
          eq(screenshotRequests.status, "pending")
        )
      )
      .orderBy(asc(screenshotRequests.requestedAt))
      .limit(1);

    if (existing) {
      return NextResponse.json(
        {
          success: true,
          id: existing.id,
          status: existing.status,
          coalesced: true,
        },
        { status: 200 }
      );
    }

    const [row] = await db
      .insert(screenshotRequests)
      .values({
        teamId: team.id,
        hackathonId: team.hackathonId,
        status: "pending",
      })
      .returning();

    return NextResponse.json(
      { success: true, id: row.id, status: row.status },
      { status: 201 }
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
