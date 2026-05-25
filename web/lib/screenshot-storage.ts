import { writeFile, mkdir } from "fs/promises";
import path from "path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

export type StoredScreenshot = {
  url: string;
  /** Set when the backend fell back to /tmp; surface to clients so data loss is visible. */
  warning?: string;
};

const TMP_DIR = path.join("/tmp", "screenshots");
const EXTS = ["png", "jpg", "webp"] as const;
type Ext = (typeof EXTS)[number];

function extFor(contentType: string): Ext {
  const ct = contentType.toLowerCase();
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("webp")) return "webp";
  return "png";
}

function mimeFor(ext: Ext): string {
  return ext === "png" ? "image/png" : ext === "jpg" ? "image/jpeg" : "image/webp";
}

function s3KeyFor(id: number, ext: Ext): string {
  return `screenshots/screenshot-${id}.${ext}`;
}

export function isS3Configured(): boolean {
  return Boolean(
    process.env.S3_BUCKET &&
      process.env.S3_REGION &&
      process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY
  );
}

let cachedClient: S3Client | null = null;
function s3(): S3Client {
  if (cachedClient) return cachedClient;
  cachedClient = new S3Client({
    region: process.env.S3_REGION,
    // Optional custom endpoint for S3-compatible providers (R2, MinIO, …).
    // forcePathStyle is required by most non-AWS S3 implementations.
    ...(process.env.S3_ENDPOINT
      ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true }
      : {}),
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      // Required for temporary STS credentials (ASIA… access keys).
      ...(process.env.S3_SESSION_TOKEN
        ? { sessionToken: process.env.S3_SESSION_TOKEN }
        : {}),
    },
  });
  return cachedClient;
}

/**
 * Store a screenshot image.
 *  - If S3 is configured: PUTs the object (private) and returns the stable app
 *    URL /api/screenshots/[id]/raw, which streams it back from S3.
 *  - Otherwise: writes to /tmp and returns a loud warning (dev/ephemeral).
 */
export async function storeScreenshot(
  id: number,
  buffer: Buffer,
  contentType: string
): Promise<StoredScreenshot> {
  const ext = extFor(contentType);
  const filename = `screenshot-${id}.${ext}`;

  if (isS3Configured()) {
    await s3().send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET!,
        Key: s3KeyFor(id, ext),
        Body: buffer,
        ContentType: contentType,
      })
    );
    // Stable app URL — the /raw route streams the object from S3. Keeps the
    // bucket private and the stored URL permanent (no presigned-URL expiry).
    return { url: `/api/screenshots/${id}/raw` };
  }

  await mkdir(TMP_DIR, { recursive: true });
  await writeFile(path.join(TMP_DIR, filename), buffer);
  return {
    url: `/api/screenshots/${id}/raw`,
    warning:
      "S3 is not configured (S3_BUCKET/S3_REGION/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY) — screenshot was written to /tmp and will be lost on next deploy/restart.",
  };
}

/**
 * Fetch a stored screenshot's bytes for the /raw route. Tries S3 first (when
 * configured), then the /tmp fallback. Returns null if nothing is found.
 */
export async function readScreenshot(
  id: number
): Promise<{ bytes: Uint8Array<ArrayBuffer>; mime: string } | null> {
  // Copy into a fresh ArrayBuffer-backed Uint8Array so the bytes are a valid
  // BodyInit for the Response (TS rejects the SharedArrayBuffer-possible variant).
  const copy = (src: Uint8Array): Uint8Array<ArrayBuffer> => {
    const out = new Uint8Array(src.length);
    out.set(src);
    return out;
  };

  if (isS3Configured()) {
    for (const ext of EXTS) {
      try {
        const res = await s3().send(
          new GetObjectCommand({
            Bucket: process.env.S3_BUCKET!,
            Key: s3KeyFor(id, ext),
          })
        );
        const raw = await res.Body!.transformToByteArray();
        return { bytes: copy(raw), mime: res.ContentType ?? mimeFor(ext) };
      } catch {
        // NoSuchKey / NotFound → try next extension.
      }
    }
    return null;
  }

  const { readFile } = await import("fs/promises");
  const { existsSync } = await import("fs");
  for (const ext of EXTS) {
    const filePath = path.join(TMP_DIR, `screenshot-${id}.${ext}`);
    if (existsSync(filePath)) {
      const buf = await readFile(filePath);
      return { bytes: copy(buf), mime: mimeFor(ext) };
    }
  }
  return null;
}

/** Best-effort deletion of a screenshot's object(s) from S3 or /tmp. */
export async function deleteScreenshot(id: number): Promise<void> {
  if (isS3Configured()) {
    await Promise.all(
      EXTS.map((ext) =>
        s3()
          .send(
            new DeleteObjectCommand({
              Bucket: process.env.S3_BUCKET!,
              Key: s3KeyFor(id, ext),
            })
          )
          .catch(() => {})
      )
    );
    return;
  }

  const { unlink } = await import("fs/promises");
  const { existsSync } = await import("fs");
  for (const ext of EXTS) {
    const p = path.join(TMP_DIR, `screenshot-${id}.${ext}`);
    if (existsSync(p)) {
      try {
        await unlink(p);
      } catch {
        // ignore
      }
    }
  }
}
