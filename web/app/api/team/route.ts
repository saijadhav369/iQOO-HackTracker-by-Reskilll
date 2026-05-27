export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { teams } from "@/lib/db/schema";
import { createTeamSchema } from "@/lib/validators";
import { getSession } from "@/lib/auth/jwt";

// Translate the underlying Postgres error code into a friendly message + the
// right HTTP status. Without this the raw Drizzle "Failed query: insert into
// teams ..." blob leaks into the dashboard's add-team toast.
function pgErrorResponse(e: unknown): NextResponse {
  const err = e as { code?: string; detail?: string; constraint?: string; message?: string };
  if (err?.code === "23505") {
    // unique_violation — almost always a duplicate team id.
    return NextResponse.json(
      { error: "A team with that Team ID already exists. Pick a different ID." },
      { status: 409 }
    );
  }
  if (err?.code === "23503") {
    // foreign_key_violation — hackathon_id doesn't exist.
    return NextResponse.json(
      { error: "Hackathon ID does not exist. Create the hackathon first." },
      { status: 400 }
    );
  }
  const message = err?.message ?? "Invalid request";
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const data = createTeamSchema.parse(body);

    const [row] = await db
      .insert(teams)
      .values({
        id: data.id,
        hackathonId: data.hackathon_id,
        name: data.name,
        deviceId: data.device_id ?? null,
        members: data.members ?? null,
      })
      .returning();

    return NextResponse.json(row, { status: 201 });
  } catch (e: unknown) {
    return pgErrorResponse(e);
  }
}
