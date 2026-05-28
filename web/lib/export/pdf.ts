// PDF rendering for team + hackathon exports. Pure function of the bundle:
// no DB, no network. pdfkit is treated as a Node external in next.config.ts
// because Turbopack can't see its AFM core-font binaries otherwise.
//
// Layout strategy: A4, 40pt margins, Helvetica. Tables are hand-laid with
// fixed column widths (pdfkit has no table primitive). Tall sections call
// `addPageIfNeeded(doc, height)` to keep rows from being split across pages.

import PDFDocument from "pdfkit";
import { readFileSync } from "fs";
import path from "path";
import type {
  HackathonBundle,
  LeaderboardBundle,
  ScreenshotPayload,
  TeamBundle,
  TeamMemberDetail,
  CrashRow,
  TamperRow,
  TimelineRow,
  VitalsRow,
  SensorRow,
  AppUsageRow,
} from "@/lib/export/types";
import { CONTRIBUTORS, CONTRIBUTOR_LABELS } from "@/lib/scoring";

// One-time read of the brand logo. Falls back to null if the file is missing
// (only happens in custom test rigs; production always ships /public assets).
let LOGO_BYTES: Buffer | null = null;
try {
  LOGO_BYTES = readFileSync(
    path.join(process.cwd(), "public", "HackTracker.png")
  );
} catch {
  LOGO_BYTES = null;
}

const MARGIN = 40;
const PAGE_HEIGHT = 842; // A4
const PAGE_WIDTH = 595;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Doc = any; // pdfkit's type surface is messy; chained calls only.

function addPageIfNeeded(doc: Doc, height: number) {
  if (doc.y + height > PAGE_HEIGHT - MARGIN) doc.addPage();
}

function h1(doc: Doc, text: string) {
  doc.moveDown(0.5);
  doc.font("Helvetica-Bold").fontSize(18).fillColor("#000").text(text);
  doc
    .moveTo(MARGIN, doc.y + 2)
    .lineTo(PAGE_WIDTH - MARGIN, doc.y + 2)
    .strokeColor("#bdbf04")
    .lineWidth(2)
    .stroke();
  doc.moveDown(0.8);
}

function h2(doc: Doc, text: string) {
  addPageIfNeeded(doc, 36);
  doc.moveDown(0.4);
  doc.font("Helvetica-Bold").fontSize(13).fillColor("#000").text(text);
  doc.moveDown(0.3);
}

function muted(doc: Doc, text: string) {
  doc.font("Helvetica").fontSize(9).fillColor("#666").text(text);
  doc.fillColor("#000");
}

function bodyText(doc: Doc, text: string, opts?: { font?: string; size?: number }) {
  doc
    .font(opts?.font ?? "Helvetica")
    .fontSize(opts?.size ?? 10)
    .fillColor("#000")
    .text(text);
}

function kvGrid(doc: Doc, rows: Array<[string, string]>) {
  const labelW = 160;
  doc.font("Helvetica").fontSize(10);
  for (const [k, v] of rows) {
    addPageIfNeeded(doc, 16);
    const y = doc.y;
    doc.fillColor("#888").text(k, MARGIN, y, { width: labelW });
    doc.fillColor("#000").text(v, MARGIN + labelW, y, {
      width: CONTENT_WIDTH - labelW,
    });
    doc.moveDown(0.2);
  }
  doc.moveDown(0.3);
}

interface Column {
  label: string;
  width: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get: (row: any) => string;
}

function table(doc: Doc, columns: Column[], rows: unknown[]) {
  if (rows.length === 0) {
    muted(doc, "(no rows)");
    return;
  }
  const rowHeight = 14;
  const totalW = columns.reduce((s, c) => s + c.width, 0);
  const startX = MARGIN + Math.max(0, (CONTENT_WIDTH - totalW) / 2);

  const drawHeader = () => {
    addPageIfNeeded(doc, rowHeight + 2);
    const y = doc.y;
    let x = startX;
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#444");
    for (const c of columns) {
      doc.text(c.label.toUpperCase(), x, y, { width: c.width, ellipsis: true });
      x += c.width;
    }
    doc
      .moveTo(startX, y + rowHeight - 2)
      .lineTo(startX + totalW, y + rowHeight - 2)
      .strokeColor("#ddd")
      .lineWidth(0.5)
      .stroke();
    doc.y = y + rowHeight;
    doc.fillColor("#000");
  };

  drawHeader();
  doc.font("Helvetica").fontSize(8).fillColor("#000");

  for (const r of rows) {
    if (doc.y + rowHeight > PAGE_HEIGHT - MARGIN) {
      doc.addPage();
      drawHeader();
      doc.font("Helvetica").fontSize(8).fillColor("#000");
    }
    const y = doc.y;
    let x = startX;
    for (const c of columns) {
      doc.text(c.get(r), x, y, {
        width: c.width,
        ellipsis: true,
        lineBreak: false,
      });
      x += c.width;
    }
    doc.y = y + rowHeight;
  }
  doc.moveDown(0.6);
}

function fmtNum(n: number | null | undefined, digits = 0): string {
  if (n == null) return "—";
  return digits === 0 ? Math.round(n).toString() : n.toFixed(digits);
}

function fmtBool(v: boolean | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return v ? "yes" : "no";
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", { hour12: false });
}

function shortTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB")} ${d.toLocaleTimeString("en-GB", {
    hour12: false,
  })}`;
}

// -----------------------------------------------------------------------------
// Cover

function teamCover(doc: Doc, bundle: TeamBundle) {
  if (LOGO_BYTES) {
    try {
      doc.image(LOGO_BYTES, MARGIN, MARGIN, { width: 56 });
    } catch {
      // pdfkit refuses some PNGs; safe to ignore — text cover still works.
    }
  }
  doc.y = MARGIN + 70;
  doc.font("Helvetica-Bold").fontSize(28).fillColor("#000").text("HackTracker");
  doc.font("Helvetica").fontSize(14).fillColor("#666").text("Team Report");
  doc.moveDown(1);
  doc.font("Helvetica-Bold").fontSize(20).fillColor("#000").text(bundle.team.name);
  muted(doc, `Team ID: ${bundle.team.id}`);
  doc.moveDown(0.5);

  const scoreCell =
    bundle.buildScore != null
      ? `${bundle.buildScore.toFixed(3)}${
          bundle.buildRank != null ? `  (rank #${bundle.buildRank})` : ""
        }`
      : "—";
  kvGrid(doc, [
    ["Hackathon", `${bundle.hackathon.name} (${bundle.hackathon.id})`],
    [
      "Window",
      `${fmtTime(bundle.hackathon.startTime)}  →  ${fmtTime(bundle.hackathon.endTime)}`,
    ],
    ["Hackathon status", bundle.hackathon.status],
    ["Venue light", bundle.hackathon.currentLight],
    ["Build score", scoreCell],
    ["Device ID (primary)", bundle.team.deviceId ?? "—"],
    ["Members", bundle.team.members?.map((m) => m.name).join(", ") ?? "—"],
    ["Tracking status", bundle.status],
    ["Last heartbeat", fmtTime(bundle.heartbeat?.lastSeen ?? null)],
    ["Generated at", fmtTime(bundle.generatedAt)],
  ]);
}

function hackathonCover(doc: Doc, bundle: HackathonBundle) {
  if (LOGO_BYTES) {
    try {
      doc.image(LOGO_BYTES, MARGIN, MARGIN, { width: 56 });
    } catch {}
  }
  doc.y = MARGIN + 70;
  doc.font("Helvetica-Bold").fontSize(28).fillColor("#000").text("HackTracker");
  doc.font("Helvetica").fontSize(14).fillColor("#666").text("Hackathon Report");
  doc.moveDown(1);
  doc.font("Helvetica-Bold").fontSize(20).fillColor("#000").text(bundle.hackathon.name);
  muted(doc, `Hackathon ID: ${bundle.hackathon.id}`);
  doc.moveDown(0.5);

  kvGrid(doc, [
    [
      "Window",
      `${fmtTime(bundle.hackathon.startTime)}  →  ${fmtTime(bundle.hackathon.endTime)}`,
    ],
    ["Status", bundle.hackathon.status],
    ["Venue light", bundle.hackathon.currentLight],
    ["Teams", bundle.teams.length.toString()],
    ["Light transitions", bundle.lightTransitions.length.toString()],
    ["Notifications sent", bundle.notifications.length.toString()],
    ["Generated at", fmtTime(bundle.generatedAt)],
  ]);
}

// -----------------------------------------------------------------------------
// Team sections (reused by both team and hackathon PDFs)

function totalsStrip(doc: Doc, b: TeamBundle) {
  h2(doc, "Totals");
  const rows: Array<[string, string]> = [];
  if (b.buildScore != null) {
    rows.push([
      "Build score",
      `${b.buildScore.toFixed(3)}${
        b.buildRank != null ? `  (rank #${b.buildRank})` : ""
      }`,
    ]);
  }
  rows.push(
    ["Taps", b.totals.taps.toLocaleString()],
    ["Text inputs", b.totals.textInputs.toLocaleString()],
    ["Scrolls", b.totals.scrolls.toLocaleString()],
    ["App switches", b.totals.appSwitches.toLocaleString()],
    [
      "Keyboard active",
      `${b.totals.keyboardActiveSeconds.toLocaleString()} s`,
    ],
    ["Office Kit", `${b.totals.officeKitSeconds.toLocaleString()} s`],
    ["Camera opens", b.totals.cameraOpens.toString()],
    ["Clipboard events", b.totals.clipboardEvents.toString()],
    ["Crashes", b.totals.crashCount.toString()],
    ["Tamper events", b.totals.tamperCount.toString()],
    ["Longest session", `${b.totals.longestSessionMinutes} min`]
  );
  kvGrid(doc, rows);
}

function membersTable(doc: Doc, members: TeamMemberDetail[]) {
  h2(doc, `Members (${members.length})`);
  if (members.length === 0) {
    muted(doc, "(no members registered)");
    return;
  }
  table(
    doc,
    [
      { label: "Slot", width: 30, get: (m: TeamMemberDetail) => `#${m.slot}` },
      { label: "Name", width: 110, get: (m: TeamMemberDetail) => m.memberName },
      {
        label: "Status",
        width: 50,
        get: (m: TeamMemberDetail) => m.status,
      },
      {
        label: "Last seen",
        width: 100,
        get: (m: TeamMemberDetail) => shortTime(m.lastSeen),
      },
      {
        label: "Batt%",
        width: 40,
        get: (m: TeamMemberDetail) => fmtNum(m.batteryLevel),
      },
      {
        label: "Taps",
        width: 45,
        get: (m: TeamMemberDetail) => m.totals.taps.toLocaleString(),
      },
      {
        label: "Text",
        width: 40,
        get: (m: TeamMemberDetail) => m.totals.textInputs.toLocaleString(),
      },
      {
        label: "Kbd s",
        width: 40,
        get: (m: TeamMemberDetail) =>
          m.totals.keyboardActiveSeconds.toLocaleString(),
      },
      {
        label: "OfficeKit s",
        width: 55,
        get: (m: TeamMemberDetail) =>
          m.totals.officeKitSeconds.toLocaleString(),
      },
      {
        label: "Crash",
        width: 35,
        get: (m: TeamMemberDetail) => m.totals.crashCount.toString(),
      },
    ],
    members
  );
}

function timelineTable(doc: Doc, rows: TimelineRow[]) {
  h2(doc, `Activity Timeline (${rows.length})`);
  table(
    doc,
    [
      { label: "Start", width: 90, get: (r: TimelineRow) => shortTime(r.periodStart) },
      { label: "End", width: 90, get: (r: TimelineRow) => shortTime(r.periodEnd) },
      { label: "Taps", width: 35, get: (r: TimelineRow) => fmtNum(r.taps) },
      { label: "Text", width: 35, get: (r: TimelineRow) => fmtNum(r.textInputs) },
      { label: "Scroll", width: 40, get: (r: TimelineRow) => fmtNum(r.scrolls) },
      { label: "Swtch", width: 35, get: (r: TimelineRow) => fmtNum(r.appSwitches) },
      { label: "Kbd s", width: 35, get: (r: TimelineRow) => fmtNum(r.keyboardActiveSeconds) },
      { label: "OfficeKit s", width: 55, get: (r: TimelineRow) => fmtNum(r.officeKitSeconds) },
      { label: "Foreground", width: 100, get: (r: TimelineRow) => r.foregroundApp ?? "—" },
    ],
    rows
  );
}

function appUsageTable(doc: Doc, rows: AppUsageRow[]) {
  h2(doc, `App Usage (${rows.length})`);
  table(
    doc,
    [
      { label: "Package", width: 200, get: (r: AppUsageRow) => r.appPackage },
      { label: "Label", width: 170, get: (r: AppUsageRow) => r.appLabel ?? "—" },
      {
        label: "Foreground min",
        width: 80,
        get: (r: AppUsageRow) => r.foregroundMinutes.toFixed(1),
      },
      { label: "Opens", width: 50, get: (r: AppUsageRow) => fmtNum(r.openCount) },
    ],
    rows
  );
}

function vitalsTable(doc: Doc, rows: VitalsRow[]) {
  h2(doc, `Device Vitals (${rows.length})`);
  table(
    doc,
    [
      { label: "Time", width: 100, get: (r: VitalsRow) => shortTime(r.recordedAt) },
      { label: "Batt%", width: 35, get: (r: VitalsRow) => fmtNum(r.batteryLevel) },
      { label: "Temp °C", width: 40, get: (r: VitalsRow) => fmtNum(r.temperature, 1) },
      { label: "MemPr%", width: 40, get: (r: VitalsRow) => fmtNum(r.cpuUsage, 1) },
      { label: "ThStat", width: 35, get: (r: VitalsRow) => fmtNum(r.thermalStatus) },
      { label: "ThHead", width: 40, get: (r: VitalsRow) => fmtNum(r.thermalHeadroom, 2) },
      { label: "Mon", width: 25, get: (r: VitalsRow) => fmtBool(r.monsterMode) },
      { label: "Chg", width: 30, get: (r: VitalsRow) => fmtBool(r.isCharging) },
      { label: "ChgT", width: 35, get: (r: VitalsRow) => r.chargingType ?? "—" },
      { label: "Net", width: 35, get: (r: VitalsRow) => r.networkType ?? "—" },
      { label: "RSSI", width: 35, get: (r: VitalsRow) => fmtNum(r.wifiRssi) },
      { label: "Cell dBm", width: 45, get: (r: VitalsRow) => fmtNum(r.cellularDbm) },
    ],
    rows
  );
}

function sensorsTable(doc: Doc, rows: SensorRow[]) {
  h2(doc, `Sensor Aggregates (${rows.length})`);
  table(
    doc,
    [
      { label: "Start", width: 90, get: (r: SensorRow) => shortTime(r.periodStart) },
      { label: "End", width: 90, get: (r: SensorRow) => shortTime(r.periodEnd) },
      { label: "Accel μ", width: 45, get: (r: SensorRow) => fmtNum(r.accelMean, 2) },
      { label: "Accel σ", width: 45, get: (r: SensorRow) => fmtNum(r.accelStddev, 2) },
      { label: "Accel pk", width: 50, get: (r: SensorRow) => fmtNum(r.accelPeak, 2) },
      { label: "Gyro μ", width: 40, get: (r: SensorRow) => fmtNum(r.gyroMean, 2) },
      { label: "Gyro σ", width: 40, get: (r: SensorRow) => fmtNum(r.gyroStddev, 2) },
      { label: "Lux μ", width: 40, get: (r: SensorRow) => fmtNum(r.luxMean, 1) },
      { label: "Prox %", width: 40, get: (r: SensorRow) => fmtNum(r.proximityNearPct, 1) },
      { label: "Steps", width: 35, get: (r: SensorRow) => fmtNum(r.stepsDelta) },
    ],
    rows
  );
}

function crashesSection(doc: Doc, rows: CrashRow[]) {
  h2(doc, `Crashes (${rows.length})`);
  if (rows.length === 0) {
    muted(doc, "(no crashes recorded)");
    return;
  }
  for (const c of rows) {
    addPageIfNeeded(doc, 80);
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#000");
    doc.text(`${fmtTime(c.occurredAt)} — ${c.reason ?? "(no reason)"}`);
    doc.font("Helvetica").fontSize(9).fillColor("#666");
    doc.text(
      `thread: ${c.threadName ?? "—"}   foreground: ${c.foregroundApp ?? "—"}`
    );
    if (c.stacktrace) {
      doc.font("Courier").fontSize(7).fillColor("#222");
      doc.text(c.stacktrace, { lineGap: 0 });
    }
    doc.fillColor("#000");
    doc.moveDown(0.6);
  }
}

function tamperSection(doc: Doc, rows: TamperRow[]) {
  h2(doc, `Tamper Events (${rows.length})`);
  table(
    doc,
    [
      { label: "Time", width: 110, get: (r: TamperRow) => fmtTime(r.occurredAt) },
      { label: "Type", width: 110, get: (r: TamperRow) => r.type },
      {
        label: "Detail",
        width: 230,
        get: (r: TamperRow) => {
          if (r.detail == null) return "—";
          const s = JSON.stringify(r.detail);
          return s.length > 200 ? s.slice(0, 200) + "…" : s;
        },
      },
      { label: "Resolved", width: 90, get: (r: TamperRow) => fmtTime(r.resolvedAt) },
    ],
    rows
  );
}

function screenshotsSection(doc: Doc, rows: ScreenshotPayload[]) {
  h2(doc, `Screenshots (showing up to ${rows.length})`);
  if (rows.length === 0) {
    muted(doc, "(no screenshots recorded)");
    return;
  }
  for (const s of rows) {
    // Use ~half-page tiles so 2 fit per page.
    addPageIfNeeded(doc, 360);
    const y = doc.y;
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#000");
    doc.text(`#${s.id}  •  ${s.status}`, MARGIN, y);
    doc.font("Helvetica").fontSize(8).fillColor("#666");
    doc.text(
      `requested ${fmtTime(s.requestedAt)}   captured ${fmtTime(s.capturedAt)}`,
      { lineGap: 0 }
    );

    if (s.bytes && (s.mime === "image/png" || s.mime === "image/jpeg")) {
      try {
        doc.image(Buffer.from(s.bytes), MARGIN, doc.y + 4, {
          fit: [CONTENT_WIDTH, 300],
        });
        doc.y += 304;
      } catch {
        muted(doc, "(image could not be embedded)");
      }
    } else if (s.skippedReason) {
      muted(doc, `(image skipped: ${s.skippedReason})`);
    } else {
      muted(doc, "(no image data)");
    }
    doc.fillColor("#000");
    doc.moveDown(0.6);
  }
}

function teamSection(doc: Doc, bundle: TeamBundle, { newPage }: { newPage: boolean }) {
  if (newPage) doc.addPage();
  h1(doc, `Team — ${bundle.team.name}`);
  totalsStrip(doc, bundle);
  membersTable(doc, bundle.membersDetail);
  timelineTable(doc, bundle.timeline);
  appUsageTable(doc, bundle.appUsage);
  vitalsTable(doc, bundle.vitals);
  sensorsTable(doc, bundle.sensors);
  crashesSection(doc, bundle.crashes);
  tamperSection(doc, bundle.tamper);
  screenshotsSection(doc, bundle.screenshots);
}

// -----------------------------------------------------------------------------
// Public renderers

export function renderTeamPdf(bundle: TeamBundle): NodeJS.ReadableStream {
  const doc = new PDFDocument({
    size: "A4",
    margin: MARGIN,
    info: {
      Title: `HackTracker — ${bundle.team.name} (${bundle.team.id})`,
      Author: "HackTracker",
    },
  });
  teamCover(doc, bundle);
  teamSection(doc, bundle, { newPage: true });
  doc.end();
  return doc as unknown as NodeJS.ReadableStream;
}

export function renderHackathonPdf(bundle: HackathonBundle): NodeJS.ReadableStream {
  const doc = new PDFDocument({
    size: "A4",
    margin: MARGIN,
    info: {
      Title: `HackTracker — ${bundle.hackathon.name} (${bundle.hackathon.id})`,
      Author: "HackTracker",
    },
  });
  hackathonCover(doc, bundle);

  // Leaderboard summary
  doc.addPage();
  h1(doc, "Leaderboard");
  table(
    doc,
    [
      { label: "Rank", width: 40, get: (r) => `#${r.rank}` },
      { label: "Team", width: 200, get: (r) => r.teamName },
      { label: "Build Score", width: 80, get: (r) => r.buildScore.toFixed(3) },
      { label: "Most Active", width: 70, get: (r) => r.mostActive.toLocaleString() },
      { label: "Office Kit", width: 60, get: (r) => `${Math.round(r.mostOfficeKit)} m` },
      {
        label: "Demerits",
        width: 60,
        get: (r) =>
          (
            r.breakdown.crashCount.raw + r.breakdown.idleWarningCount.raw
          ).toString(),
      },
    ],
    bundle.rankings
  );

  // Weights
  h2(doc, "Scoring Weights");
  kvGrid(
    doc,
    CONTRIBUTORS.map((c) => [
      CONTRIBUTOR_LABELS[c],
      bundle.weights[c].toFixed(2),
    ])
  );

  // Light transitions
  h2(doc, `Light Transitions (${bundle.lightTransitions.length})`);
  table(
    doc,
    [
      { label: "Time", width: 160, get: (r) => fmtTime(r.changedAt) },
      { label: "Light", width: 80, get: (r) => r.light },
      { label: "Changed by", width: 200, get: (r) => r.changedBy ?? "—" },
    ],
    bundle.lightTransitions
  );

  // Notifications
  h2(doc, `Notifications (${bundle.notifications.length})`);
  table(
    doc,
    [
      { label: "Time", width: 120, get: (r) => fmtTime(r.createdAt) },
      { label: "Target", width: 70, get: (r) => r.targetFilter },
      { label: "Title", width: 130, get: (r) => r.title },
      { label: "Message", width: 200, get: (r) => r.message },
    ],
    bundle.notifications
  );

  // Per-team chapters
  for (const t of bundle.teams) {
    teamSection(doc, t, { newPage: true });
  }

  doc.end();
  return doc as unknown as NodeJS.ReadableStream;
}

// Leaderboard-only PDF — cover + rankings + scoring weights + per-team
// members. Skips the heavy timeline/vitals/screenshot chapters. Used when
// the organiser wants a concise printable scoreboard rather than the full
// hackathon dump.
export function renderLeaderboardPdf(
  bundle: LeaderboardBundle
): NodeJS.ReadableStream {
  const doc = new PDFDocument({
    size: "A4",
    margin: MARGIN,
    info: {
      Title: `HackTracker Leaderboard — ${bundle.hackathon.name}`,
      Author: "HackTracker",
    },
  });

  // Cover
  if (LOGO_BYTES) {
    try {
      doc.image(LOGO_BYTES, MARGIN, MARGIN, { width: 56 });
    } catch {}
  }
  doc.y = MARGIN + 70;
  doc.font("Helvetica-Bold").fontSize(28).fillColor("#000").text("HackTracker");
  doc.font("Helvetica").fontSize(14).fillColor("#666").text("Leaderboard");
  doc.moveDown(1);
  doc
    .font("Helvetica-Bold")
    .fontSize(20)
    .fillColor("#000")
    .text(bundle.hackathon.name);
  muted(doc, `Hackathon ID: ${bundle.hackathon.id}`);
  doc.moveDown(0.5);
  kvGrid(doc, [
    [
      "Window",
      `${fmtTime(bundle.hackathon.startTime)}  →  ${fmtTime(bundle.hackathon.endTime)}`,
    ],
    ["Status", bundle.hackathon.status],
    ["Venue light", bundle.hackathon.currentLight],
    ["Teams", bundle.teams.length.toString()],
    ["Generated at", fmtTime(bundle.generatedAt)],
  ]);

  // Rankings
  doc.addPage();
  h1(doc, "Rankings");
  table(
    doc,
    [
      { label: "Rank", width: 40, get: (r) => `#${r.rank}` },
      { label: "Team", width: 200, get: (r) => r.teamName },
      { label: "Build Score", width: 80, get: (r) => r.buildScore.toFixed(3) },
      { label: "Most Active", width: 70, get: (r) => r.mostActive.toLocaleString() },
      { label: "Office Kit", width: 60, get: (r) => `${Math.round(r.mostOfficeKit)} m` },
      {
        label: "Demerits",
        width: 60,
        get: (r) =>
          (r.breakdown.crashCount.raw + r.breakdown.idleWarningCount.raw).toString(),
      },
    ],
    bundle.rankings
  );

  // Scoring weights
  h2(doc, "Scoring Weights");
  kvGrid(
    doc,
    CONTRIBUTORS.map((c) => [CONTRIBUTOR_LABELS[c], bundle.weights[c].toFixed(2)])
  );

  // Per-team members
  for (const t of bundle.teams) {
    doc.addPage();
    h1(doc, `#${t.rank} — ${t.teamName}`);
    kvGrid(doc, [
      ["Build score", t.buildScore.toFixed(3)],
      ["Tracking status", t.status],
      ["Primary device", t.deviceId ?? "—"],
      ["Total taps", t.totals.taps.toLocaleString()],
      ["Total text inputs", t.totals.textInputs.toLocaleString()],
      [
        "Keyboard active",
        `${t.totals.keyboardActiveSeconds.toLocaleString()} s`,
      ],
      ["Office Kit", `${t.totals.officeKitSeconds.toLocaleString()} s`],
      ["Crashes", t.totals.crashCount.toString()],
    ]);
    membersTable(doc, t.membersDetail);
  }

  doc.end();
  return doc as unknown as NodeJS.ReadableStream;
}
