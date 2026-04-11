import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { teams } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";

const registerSchema = z.object({
  device_id: z.string(),
  hackathon_id: z.string(),
  team_id: z.string(),
  team_name: z.string(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = registerSchema.parse(body);

    // Check if team already exists
    const existing = await db
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.id, data.team_id))
      .limit(1);

    if (existing.length > 0) {
      // Update device_id if changed
      await db
        .update(teams)
        .set({ deviceId: data.device_id })
        .where(eq(teams.id, data.team_id));

      return NextResponse.json({ success: true, created: false });
    }

    // Create team
    await db.insert(teams).values({
      id: data.team_id,
      hackathonId: data.hackathon_id,
      name: data.team_name,
      deviceId: data.device_id,
    });

    return NextResponse.json({ success: true, created: true }, { status: 201 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
