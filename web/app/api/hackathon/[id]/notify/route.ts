import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/jwt";
import { eq, desc } from "drizzle-orm";
import { z } from "zod/v4";

export const dynamic = "force-dynamic";

const notifySchema = z.object({
  title: z.string().min(1),
  message: z.string().min(1),
  target_filter: z.enum(["all", "idle", "active", "offline", "low_taps", "high_taps", "custom"]).default("all"),
  target_min_taps: z.number().int().optional(),
  target_max_taps: z.number().int().optional(),
  target_team_ids: z.array(z.string()).optional(),
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
    const body = await req.json();
    const data = notifySchema.parse(body);

    const [row] = await db
      .insert(notifications)
      .values({
        hackathonId: id,
        title: data.title,
        message: data.message,
        targetFilter: data.target_filter,
        targetMinTaps: data.target_min_taps ?? null,
        targetMaxTaps: data.target_max_taps ?? null,
        targetTeamIds: data.target_team_ids ?? null,
      })
      .returning();

    return NextResponse.json({ success: true, id: row.id }, { status: 201 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.hackathonId, id))
      .orderBy(desc(notifications.createdAt))
      .limit(50);

    return NextResponse.json(rows);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
