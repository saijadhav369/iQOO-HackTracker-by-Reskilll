// Organiser-only hackathon export. Same shape as the per-team route but
// dispatches to the hackathon bundler/renderers and uses a different filename.

import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import { getSession } from "@/lib/auth/jwt";
import { gatherHackathonBundle } from "@/lib/export/bundle";
import { renderHackathonPdf } from "@/lib/export/pdf";
import { renderHackathonXlsx } from "@/lib/export/xlsx";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const fmt = req.nextUrl.searchParams.get("format");
  if (fmt !== "pdf" && fmt !== "xlsx") {
    return NextResponse.json(
      { error: "format must be pdf|xlsx" },
      { status: 400 }
    );
  }

  const { id } = await params;

  if (session.hackathonId !== id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let bundle;
  try {
    bundle = await gatherHackathonBundle(id);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to gather data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
  if (!bundle) {
    return NextResponse.json({ error: "Hackathon not found" }, { status: 404 });
  }

  const base = `hacktracker-${bundle.hackathon.id}-leaderboard-${stamp()}`;

  if (fmt === "pdf") {
    const stream = renderHackathonPdf(bundle);
    return new Response(
      Readable.toWeb(stream as Readable) as unknown as ReadableStream,
      {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${base}.pdf"`,
          "Cache-Control": "no-store",
        },
      }
    );
  }

  const buf = await renderHackathonXlsx(bundle);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${base}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
