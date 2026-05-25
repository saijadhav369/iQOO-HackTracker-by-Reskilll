export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { screenshotRequests } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/jwt";
import { eq } from "drizzle-orm";
import { deleteScreenshot } from "@/lib/screenshot-storage";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const numeric = Number(id);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return NextResponse.json({ error: "Bad id" }, { status: 400 });
    }

    const [row] = await db
      .select()
      .from(screenshotRequests)
      .where(eq(screenshotRequests.id, numeric))
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (row.hackathonId !== session.hackathonId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db
      .delete(screenshotRequests)
      .where(eq(screenshotRequests.id, numeric));

    // Best-effort: drop the underlying object from S3 (or /tmp fallback).
    await deleteScreenshot(numeric);

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
