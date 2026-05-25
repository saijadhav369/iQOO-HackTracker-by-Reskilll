// Streams a stored face photo back to the dashboard. Pulls from S3 when
// configured, otherwise the /tmp fallback. image_url always points here so the
// stored URL is stable and the bucket can stay private. Mirrors
// /api/screenshots/[id]/raw.

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { readFacePhoto } from "@/lib/face-photo-storage";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numeric = Number(id);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }

  const photo = await readFacePhoto(numeric);
  if (!photo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new Response(photo.bytes, {
    headers: {
      "Content-Type": photo.mime,
      "Cache-Control": "private, max-age=60",
    },
  });
}
