export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { screenshotRequests } from "@/lib/db/schema";
import { screenshotUploadFormSchema } from "@/lib/validators";
import { storeScreenshot } from "@/lib/screenshot-storage";
import { eq } from "drizzle-orm";

// Device-facing: multipart upload of a captured screenshot.
//   image: File (binary, image/*)
//   id:    matching screenshot_requests.id from the heartbeat ack
export async function POST(req: NextRequest) {
  try {
    console.log(`[SHOT] upload received from ua=${req.headers.get("user-agent") ?? "?"}`);
    const form = await req.formData();
    const parsed = screenshotUploadFormSchema.parse({
      id: form.get("id"),
      device_id: form.get("device_id") ?? undefined,
    });

    const file = form.get("image");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "Missing image" }, { status: 400 });
    }

    const [row] = await db
      .select()
      .from(screenshotRequests)
      .where(eq(screenshotRequests.id, parsed.id))
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "Unknown request id" }, { status: 404 });
    }

    if (row.status === "captured") {
      // Idempotent ack — device retried after a successful upload it didn't
      // get the response for. Keep the original capturedAt/url.
      return NextResponse.json({ success: true, id: row.id, status: row.status, image_url: row.imageUrl });
    }

    const contentType = file.type || "image/png";
    const arrayBuf = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    if (buffer.byteLength === 0) {
      return NextResponse.json({ error: "Empty image" }, { status: 400 });
    }

    const stored = await storeScreenshot(row.id, buffer, contentType);

    await db
      .update(screenshotRequests)
      .set({
        status: "captured",
        capturedAt: new Date(),
        imageUrl: stored.url,
      })
      .where(eq(screenshotRequests.id, row.id));

    return NextResponse.json({
      success: true,
      id: row.id,
      status: "captured",
      image_url: stored.url,
      ...(stored.warning ? { warning: stored.warning } : {}),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
