// Organiser-only team export. Accepts ?format=pdf|xlsx and streams (PDF) or
// returns a buffer (XLSX). Bytes never touch the DB — the bundler does all
// gathering and the renderer is a pure function of the bundle.

import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import { getSession } from "@/lib/auth/jwt";
import { gatherTeamBundle } from "@/lib/export/bundle";
import { renderTeamPdf } from "@/lib/export/pdf";
import { renderTeamXlsx } from "@/lib/export/xlsx";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function stamp(): string {
  // Filesystem-safe YYYY-MM-DDTHH-mm.
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

  let bundle;
  try {
    bundle = await gatherTeamBundle(id);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to gather data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
  if (!bundle) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  // Organiser must own the hackathon this team belongs to.
  if (session.hackathonId !== bundle.hackathon.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const base = `hacktracker-${bundle.hackathon.id}-${bundle.team.id}-${stamp()}`;

  if (fmt === "pdf") {
    const stream = renderTeamPdf(bundle);
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

  const buf = await renderTeamXlsx(bundle);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${base}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
