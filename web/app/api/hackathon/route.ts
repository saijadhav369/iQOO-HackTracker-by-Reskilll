export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hackathons } from "@/lib/db/schema";
import { createHackathonSchema } from "@/lib/validators";
import { hashPasscode } from "@/lib/auth/passcode";
import { getSession } from "@/lib/auth/jwt";

// Same friendly-error treatment as /api/team — without this, the raw Drizzle
// "Failed query: insert into hackathons ..." blob leaks into the Create
// Hackathon form when an id is reused.
function pgErrorResponse(e: unknown): NextResponse {
  const err = e as { code?: string; message?: string };
  if (err?.code === "23505") {
    return NextResponse.json(
      { error: "A hackathon with that ID already exists. Pick a different Hackathon ID." },
      { status: 409 }
    );
  }
  const message = err?.message ?? "Invalid request";
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = createHackathonSchema.parse(body);

    const [row] = await db
      .insert(hackathons)
      .values({
        id: data.id,
        name: data.name,
        startTime: new Date(data.start_time),
        endTime: new Date(data.end_time),
        organiserPasscodeHash: hashPasscode(data.passcode),
      })
      .returning();

    return NextResponse.json(row, { status: 201 });
  } catch (e: unknown) {
    return pgErrorResponse(e);
  }
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rows = await db.select().from(hackathons).orderBy(hackathons.startTime);
    return NextResponse.json(rows);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
