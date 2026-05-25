// Mirrors lib/screenshot-storage.ts but uses a `face-photos/` S3 key prefix and
// a separate /tmp fallback directory. Deliberately self-contained so changes
// here can never affect the working screenshot pipeline.

import { writeFile, mkdir } from "fs/promises";
import path from "path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";

export type StoredFacePhoto = {
  url: string;
  /** Set when the backend fell back to /tmp; surface to clients so data loss is visible. */
  warning?: string;
};

const TMP_DIR = path.join("/tmp", "face-photos");
const EXTS = ["jpg", "png", "webp"] as const;
type Ext = (typeof EXTS)[number];

function extFor(contentType: string): Ext {
  const ct = contentType.toLowerCase();
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  return "jpg";
}

function mimeFor(ext: Ext): string {
  return ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
}

function s3KeyFor(id: number, ext: Ext): string {
  return `face-photos/face-${id}.${ext}`;
}

function isS3Configured(): boolean {
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
    ...(process.env.S3_ENDPOINT
      ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true }
      : {}),
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      ...(process.env.S3_SESSION_TOKEN
        ? { sessionToken: process.env.S3_SESSION_TOKEN }
        : {}),
    },
  });
  return cachedClient;
}

export async function storeFacePhoto(
  id: number,
  buffer: Buffer,
  contentType: string
): Promise<StoredFacePhoto> {
  const ext = extFor(contentType);

  if (isS3Configured()) {
    await s3().send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET!,
        Key: s3KeyFor(id, ext),
        Body: buffer,
        ContentType: contentType,
      })
    );
    return { url: `/api/face-photos/${id}/raw` };
  }

  await mkdir(TMP_DIR, { recursive: true });
  await writeFile(path.join(TMP_DIR, `face-${id}.${ext}`), buffer);
  return {
    url: `/api/face-photos/${id}/raw`,
    warning:
      "S3 is not configured (S3_BUCKET/S3_REGION/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY) — face photo was written to /tmp and will be lost on next deploy/restart.",
  };
}

export async function readFacePhoto(
  id: number
): Promise<{ bytes: Uint8Array<ArrayBuffer>; mime: string } | null> {
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
    const filePath = path.join(TMP_DIR, `face-${id}.${ext}`);
    if (existsSync(filePath)) {
      const buf = await readFile(filePath);
      return { bytes: copy(buf), mime: mimeFor(ext) };
    }
  }
  return null;
}
