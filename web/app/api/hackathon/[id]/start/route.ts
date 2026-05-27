export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hackathons } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/jwt";
import { eq } from "drizzle-orm";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Stamp the real-world start time. The planned start_time from the create
    // form is replaced here so the manage-page elapsed counter reflects when
    // the organiser actually pressed the button, not the scheduled time. The
    // counter survives browser refreshes because this lives in the DB.
    const [updated] = await db
      .update(hackathons)
      .set({ status: "active", startTime: new Date() })
      .where(eq(hackathons.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: "Hackathon not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(updated);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
