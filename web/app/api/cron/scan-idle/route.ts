export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { scanAllActiveHackathons } from "@/lib/idle-scan";

// Cron entrypoint: sweeps idle warnings across ALL active red-light hackathons
// in one call, so a single scheduled hit covers the whole platform (no per-id
// loop on the caller). Wire a Railway Cron to GET/POST this URL every minute.
//
// Auth: if CRON_SECRET is set, the request must send it as
//   Authorization: Bearer <CRON_SECRET>   or   x-cron-secret: <CRON_SECRET>
// If CRON_SECRET is unset (local dev), the endpoint is open.
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const header = req.headers.get("x-cron-secret");
  return bearer === secret || header === secret;
}

async function run(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await scanAllActiveHackathons();
    return NextResponse.json({ ...result, server_time: new Date().toISOString() });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
