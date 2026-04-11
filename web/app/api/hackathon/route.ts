export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hackathons } from "@/lib/db/schema";
import { createHackathonSchema } from "@/lib/validators";
import { hashPasscode } from "@/lib/auth/passcode";
import { getSession } from "@/lib/auth/jwt";

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
    const message = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
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
