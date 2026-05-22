// Thin wrapper around the existing `readScreenshot()` helper. The export
// pipeline asks for raw bytes; the storage helper already handles S3 + the
// /tmp dev fallback and returns null on miss. We add a 2 MB cap so a single
// runaway screenshot can't bloat a PDF/XLSX into the hundreds of megabytes.
import { readScreenshot } from "@/lib/screenshot-storage";

export const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024;

export interface FetchedScreenshot {
  bytes: Uint8Array;
  mime: string;
}

export async function fetchScreenshotBytes(
  id: number
): Promise<
  | { ok: true; data: FetchedScreenshot }
  | { ok: false; reason: "no-bytes" | "too-large" | "fetch-error" }
> {
  try {
    const res = await readScreenshot(id);
    if (!res) return { ok: false, reason: "no-bytes" };
    if (res.bytes.byteLength > MAX_SCREENSHOT_BYTES) {
      return { ok: false, reason: "too-large" };
    }
    return { ok: true, data: { bytes: res.bytes, mime: res.mime } };
  } catch {
    return { ok: false, reason: "fetch-error" };
  }
}
