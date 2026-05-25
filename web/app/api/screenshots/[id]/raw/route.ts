export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { readScreenshot } from "@/lib/screenshot-storage";

// Streams a stored screenshot back to the dashboard. Pulls from S3 when
// configured, otherwise the /tmp fallback. image_url always points here so the
// stored URL is stable and the bucket can stay private.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numeric = Number(id);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  const shot = await readScreenshot(numeric);
  if (!shot) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new Response(shot.bytes, {
    headers: {
      "Content-Type": shot.mime,
      "Cache-Control": "private, max-age=60",
    },
  });
}
