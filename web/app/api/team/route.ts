import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { teams } from "@/lib/db/schema";
import { createTeamSchema } from "@/lib/validators";
import { getSession } from "@/lib/auth/jwt";

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
    const message = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
