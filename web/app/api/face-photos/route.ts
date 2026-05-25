// Device-facing: multipart upload of a face/registration photo from the
// Android Register activity. Each capture is a new row (organiser can recapture
// any time). Same trust model as /api/screenshots and /api/events/batch — the
// caller is a registered device identified by team_id + device_id.
//
//   image:        File (binary, image/jpeg from the system camera Intent)
//   team_id:      teams.id this device is paired to (SessionManager.teamId)
//   device_id:    SessionManager.deviceId
//   hackathon_id: SessionManager.hackathonId
//   imei:         optional — device-owner installs only; empty string == null

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { facePhotos, teams } from "@/lib/db/schema";
import { storeFacePhoto } from "@/lib/face-photo-storage";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const teamId = String(form.get("team_id") ?? "").trim();
    const deviceId = String(form.get("device_id") ?? "").trim();
    const hackathonId = String(form.get("hackathon_id") ?? "").trim();
    const imeiRaw = form.get("imei");
    const imei =
      typeof imeiRaw === "string" && imeiRaw.trim().length > 0
        ? imeiRaw.trim()
        : null;

    if (!teamId || !deviceId || !hackathonId) {
      return NextResponse.json(
        { error: "Missing team_id / device_id / hackathon_id" },
        { status: 400 }
      );
    }

    const file = form.get("image");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "Missing image" }, { status: 400 });
    }

    // Cross-check the claimed team belongs to the claimed hackathon. Prevents
    // a misconfigured device from spraying photos into the wrong hackathon.
    const [team] = await db
      .select()
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);
    if (!team) {
      return NextResponse.json({ error: "Unknown team_id" }, { status: 404 });
    }
    if (team.hackathonId !== hackathonId) {
      return NextResponse.json(
        { error: "team_id does not belong to hackathon_id" },
        { status: 400 }
      );
    }

    const contentType = file.type || "image/jpeg";
    const arrayBuf = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    if (buffer.byteLength === 0) {
      return NextResponse.json({ error: "Empty image" }, { status: 400 });
    }

    // Two-step: insert to claim an id, PUT to S3 keyed by that id, then patch
    // the row with the resolved image_url. If S3 throws we delete the
    // placeholder row so the dashboard never shows a phantom (the dashboard
    // list query filters `image_url IS NOT NULL` defensively too).
    const [inserted] = await db
      .insert(facePhotos)
      .values({
        teamId,
        hackathonId,
        deviceId,
        imei,
      })
      .returning({ id: facePhotos.id });

    try {
      const stored = await storeFacePhoto(inserted.id, buffer, contentType);
      await db
        .update(facePhotos)
        .set({ imageUrl: stored.url })
        .where(eq(facePhotos.id, inserted.id));

      return NextResponse.json({
        success: true,
        id: inserted.id,
        image_url: stored.url,
        ...(stored.warning ? { warning: stored.warning } : {}),
      });
    } catch (uploadErr) {
      await db
        .delete(facePhotos)
        .where(eq(facePhotos.id, inserted.id))
        .catch(() => {});
      throw uploadErr;
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
