export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { screenshotRequests, teams } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/jwt";
import { and, asc, eq, isNull } from "drizzle-orm";

// Organiser-only: create a pending screen-capture request for a team. The
// device picks it up on its next heartbeat (≤5s) and uploads to /api/screenshots.
//
// Body (JSON, all optional):
//   { device_id: string }  // pin the request to a specific phone in the team.
//                          // Omit / null → any phone in the team picks it up.
//
// Coalesces rapid clicks: if a pending row already exists for this team AND
// the same device target, that row is returned instead of inserting a
// duplicate — otherwise the queue balloons every time the organiser
// fat-fingers the button.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: teamId } = await params;

    // Body is optional — old callers POST with no body, new callers send
    // { device_id }. Parse defensively so a bad/missing body still works.
    let deviceId: string | null = null;
    try {
      const body = await req.json();
      const raw = body?.device_id;
      if (typeof raw === "string" && raw.trim().length > 0) {
        deviceId = raw.trim();
      }
    } catch {
      // empty body — fine, fall through with deviceId = null
    }

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

    // Coalesce only when the same target is pending. Different members get
    // their own queue, so clicking Capture on Member 1 doesn't merge with a
    // pending request on Member 2.
    const deviceMatch = deviceId
      ? eq(screenshotRequests.deviceId, deviceId)
      : isNull(screenshotRequests.deviceId);
    const [existing] = await db
      .select({ id: screenshotRequests.id, status: screenshotRequests.status })
      .from(screenshotRequests)
      .where(
        and(
          eq(screenshotRequests.teamId, team.id),
          eq(screenshotRequests.status, "pending"),
          deviceMatch
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
        deviceId,
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
