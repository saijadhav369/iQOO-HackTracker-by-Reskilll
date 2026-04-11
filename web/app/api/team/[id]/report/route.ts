export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reports } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const rows = await db
      .select()
      .from(reports)
      .where(eq(reports.teamId, id))
      .orderBy(reports.generatedAt);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "No report found for this team" },
        { status: 404 }
      );
    }

    return NextResponse.json(rows[rows.length - 1]);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
