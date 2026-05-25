export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { scanIdleForHackathon } from "@/lib/idle-scan";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await scanIdleForHackathon(id);
    return NextResponse.json({ ...result, server_time: new Date().toISOString() });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
