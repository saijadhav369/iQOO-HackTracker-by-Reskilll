export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hackathons, lightTransitions } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/jwt";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";

const lightSchema = z.object({
  light: z.enum(["red", "green"]),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (session.hackathonId !== id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { light } = lightSchema.parse(body);
    const now = new Date();

    const [updated] = await db
      .update(hackathons)
      .set({ currentLight: light, lightChangedAt: now })
      .where(eq(hackathons.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Hackathon not found" }, { status: 404 });
    }

    await db.insert(lightTransitions).values({
      hackathonId: id,
      light,
      changedAt: now,
      changedBy: session.role,
    });

    return NextResponse.json({
      success: true,
      current_light: updated.currentLight,
      light_changed_at: updated.lightChangedAt,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}