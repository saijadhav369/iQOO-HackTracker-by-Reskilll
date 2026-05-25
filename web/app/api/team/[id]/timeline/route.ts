export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eventBatches } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const batches = await db
      .select({
        periodStart: eventBatches.periodStart,
        periodEnd: eventBatches.periodEnd,
        taps: eventBatches.taps,
        textInputs: eventBatches.textInputs,
        scrolls: eventBatches.scrolls,
        appSwitches: eventBatches.appSwitches,
        keyboardActiveSeconds: eventBatches.keyboardActiveSeconds,
        officeKitSeconds: eventBatches.officeKitSeconds,
        foregroundApp: eventBatches.foregroundApp,
        perAppTaps: eventBatches.perAppTaps,
      })
      .from(eventBatches)
      .where(eq(eventBatches.teamId, id))
      .orderBy(eventBatches.periodStart);

    return NextResponse.json(batches);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
