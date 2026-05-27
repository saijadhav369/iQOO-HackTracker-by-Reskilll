// Organiser-only list of registration face photos for a hackathon. Each row
// is one capture; the same IMEI / team may appear many times (recaptures are
// kept by design, not de-duped). Only rows with a populated image_url are
// returned — null image_url means the S3 PUT failed and was rolled back.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/jwt";
import { db } from "@/lib/db";
import { facePhotos, teams } from "@/lib/db/schema";
import { and, desc, eq, isNotNull } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (session.hackathonId !== id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await db
    .select({
      id: facePhotos.id,
      teamId: facePhotos.teamId,
      teamName: teams.name,
      deviceId: facePhotos.deviceId,
      imei: facePhotos.imei,
      imageUrl: facePhotos.imageUrl,
      participantName: facePhotos.participantName,
      email: facePhotos.email,
      phone: facePhotos.phone,
      capturedAt: facePhotos.capturedAt,
    })
    .from(facePhotos)
    .leftJoin(teams, eq(teams.id, facePhotos.teamId))
    .where(
      and(
        eq(facePhotos.hackathonId, id),
        isNotNull(facePhotos.imageUrl)
      )
    )
    .orderBy(desc(facePhotos.capturedAt));

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      teamId: r.teamId,
      teamName: r.teamName,
      deviceId: r.deviceId,
      imei: r.imei,
      imageUrl: r.imageUrl,
      participantName: r.participantName,
      email: r.email,
      phone: r.phone,
      capturedAt:
        r.capturedAt instanceof Date
          ? r.capturedAt.toISOString()
          : r.capturedAt,
    }))
  );
}
