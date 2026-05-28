// XLSX rendering for team + hackathon exports. exceljs is treated as a Node
// external in next.config.ts so its lazy zip/stream deps resolve at runtime.
//
// Hackathon workbook fans out into per-team sheet groups. Sheet names are
// capped at Excel's 31-char limit; long team IDs get a short hash suffix to
// stay unique.

import ExcelJS from "exceljs";
import { createHash } from "crypto";
import type {
  HackathonBundle,
  LeaderboardBundle,
  ScreenshotPayload,
  TeamBundle,
} from "@/lib/export/types";
import { CONTRIBUTORS, CONTRIBUTOR_LABELS } from "@/lib/scoring";

const HEADER_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFEFEFEF" },
};

function styleHeader(ws: ExcelJS.Worksheet) {
  const row = ws.getRow(1);
  row.font = { bold: true };
  row.fill = HEADER_FILL;
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

function safeSheetName(raw: string): string {
  // Excel: 31 chars max; / \ ? * [ ] : are not allowed.
  const cleaned = raw.replace(/[/\\?*\[\]:]/g, "_");
  if (cleaned.length <= 31) return cleaned;
  const hash = createHash("sha1").update(raw).digest("hex").slice(0, 6);
  return `${cleaned.slice(0, 24)}~${hash}`;
}

function fmtNum(v: number | null | undefined): number | string {
  return v == null ? "" : v;
}

function fmtBool(v: boolean | null | undefined): string {
  if (v == null) return "";
  return v ? "yes" : "no";
}

function fmtJson(v: unknown): string {
  if (v == null) return "";
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

// -----------------------------------------------------------------------------
// Per-team sheets — reused from both renderers.

function writeSummarySheet(ws: ExcelJS.Worksheet, b: TeamBundle) {
  ws.columns = [
    { header: "Field", key: "k", width: 28 },
    { header: "Value", key: "v", width: 64 },
  ];
  ws.addRows([
    { k: "Team ID", v: b.team.id },
    { k: "Team name", v: b.team.name },
    { k: "Device ID", v: b.team.deviceId ?? "" },
    {
      k: "Members",
      v: b.team.members?.map((m) => m.name).join(", ") ?? "",
    },
    { k: "Hackathon ID", v: b.hackathon.id },
    { k: "Hackathon name", v: b.hackathon.name },
    { k: "Hackathon status", v: b.hackathon.status },
    { k: "Venue light", v: b.hackathon.currentLight },
    { k: "Hackathon start", v: b.hackathon.startTime },
    { k: "Hackathon end", v: b.hackathon.endTime },
    { k: "Tracking status", v: b.status },
    { k: "Build score", v: b.buildScore == null ? "" : b.buildScore },
    { k: "Build rank", v: b.buildRank == null ? "" : b.buildRank },
    { k: "Last heartbeat", v: b.heartbeat?.lastSeen ?? "" },
    { k: "Last clean exit", v: fmtBool(b.heartbeat?.lastCleanExit) },
    {
      k: "Last battery %",
      v: fmtNum(b.heartbeat?.batteryLevel ?? null),
    },
    {
      k: "Last temperature °C",
      v: fmtNum(b.heartbeat?.temperature ?? null),
    },
    { k: "Total taps", v: b.totals.taps },
    { k: "Total text inputs", v: b.totals.textInputs },
    { k: "Total scrolls", v: b.totals.scrolls },
    { k: "Total app switches", v: b.totals.appSwitches },
    {
      k: "Keyboard active (s)",
      v: b.totals.keyboardActiveSeconds,
    },
    { k: "Office Kit (s)", v: b.totals.officeKitSeconds },
    { k: "Camera opens", v: b.totals.cameraOpens },
    { k: "Clipboard events", v: b.totals.clipboardEvents },
    { k: "Crash count", v: b.totals.crashCount },
    { k: "Tamper count", v: b.totals.tamperCount },
    {
      k: "Longest session (min)",
      v: b.totals.longestSessionMinutes,
    },
    { k: "Generated at", v: b.generatedAt },
  ]);
  styleHeader(ws);
}

function writeMembersSheet(ws: ExcelJS.Worksheet, b: TeamBundle) {
  ws.columns = [
    { header: "slot", key: "slot", width: 6 },
    { header: "memberName", key: "name", width: 22 },
    { header: "deviceId", key: "dev", width: 24 },
    { header: "status", key: "st", width: 10 },
    { header: "lastSeen", key: "ls", width: 22 },
    { header: "batteryLevel", key: "bat", width: 12 },
    { header: "taps", key: "taps", width: 10 },
    { header: "textInputs", key: "tx", width: 12 },
    { header: "scrolls", key: "sc", width: 10 },
    { header: "appSwitches", key: "as", width: 12 },
    { header: "keyboardActiveSec", key: "kb", width: 18 },
    { header: "officeKitSec", key: "ok", width: 14 },
    { header: "crashCount", key: "cc", width: 12 },
  ];
  for (const m of b.membersDetail) {
    ws.addRow({
      slot: m.slot,
      name: m.memberName,
      dev: m.deviceId ?? "",
      st: m.status,
      ls: m.lastSeen ?? "",
      bat: fmtNum(m.batteryLevel),
      taps: m.totals.taps,
      tx: m.totals.textInputs,
      sc: m.totals.scrolls,
      as: m.totals.appSwitches,
      kb: m.totals.keyboardActiveSeconds,
      ok: m.totals.officeKitSeconds,
      cc: m.totals.crashCount,
    });
  }
  styleHeader(ws);
}

function writeTimelineSheet(ws: ExcelJS.Worksheet, b: TeamBundle) {
  ws.columns = [
    { header: "periodStart", key: "ps", width: 22 },
    { header: "periodEnd", key: "pe", width: 22 },
    { header: "taps", key: "taps", width: 8 },
    { header: "textInputs", key: "txt", width: 10 },
    { header: "scrolls", key: "sc", width: 8 },
    { header: "appSwitches", key: "as", width: 12 },
    { header: "keyboardActiveSeconds", key: "kbs", width: 22 },
    { header: "officeKitSeconds", key: "oks", width: 18 },
    { header: "foregroundApp", key: "fa", width: 38 },
    { header: "perAppTaps", key: "pat", width: 60 },
  ];
  for (const r of b.timeline) {
    ws.addRow({
      ps: r.periodStart,
      pe: r.periodEnd,
      taps: fmtNum(r.taps),
      txt: fmtNum(r.textInputs),
      sc: fmtNum(r.scrolls),
      as: fmtNum(r.appSwitches),
      kbs: fmtNum(r.keyboardActiveSeconds),
      oks: fmtNum(r.officeKitSeconds),
      fa: r.foregroundApp ?? "",
      pat: fmtJson(r.perAppTaps),
    });
  }
  styleHeader(ws);
}

function writeAppUsageSheet(ws: ExcelJS.Worksheet, b: TeamBundle) {
  ws.columns = [
    { header: "appPackage", key: "pkg", width: 42 },
    { header: "appLabel", key: "label", width: 28 },
    { header: "foregroundMinutes", key: "fg", width: 20 },
    { header: "openCount", key: "oc", width: 12 },
  ];
  for (const r of b.appUsage) {
    ws.addRow({
      pkg: r.appPackage,
      label: r.appLabel ?? "",
      fg: Number(r.foregroundMinutes.toFixed(2)),
      oc: r.openCount,
    });
  }
  styleHeader(ws);
}

function writeVitalsSheet(ws: ExcelJS.Worksheet, b: TeamBundle) {
  ws.columns = [
    { header: "recordedAt", key: "t", width: 22 },
    { header: "batteryLevel", key: "bat", width: 12 },
    { header: "temperature", key: "temp", width: 12 },
    { header: "cpuUsage", key: "cpu", width: 10 },
    { header: "thermalStatus", key: "ts", width: 14 },
    { header: "thermalHeadroom", key: "th", width: 16 },
    { header: "monsterMode", key: "mm", width: 12 },
    { header: "memAvailableMb", key: "ma", width: 16 },
    { header: "memTotalMb", key: "mt", width: 12 },
    { header: "isCharging", key: "ic", width: 12 },
    { header: "chargingType", key: "ct", width: 14 },
    { header: "networkType", key: "nt", width: 12 },
    { header: "cellularDbm", key: "cd", width: 12 },
    { header: "wifiRssi", key: "wr", width: 10 },
    { header: "dataRxMb", key: "rx", width: 12 },
    { header: "dataTxMb", key: "tx", width: 12 },
  ];
  for (const r of b.vitals) {
    ws.addRow({
      t: r.recordedAt,
      bat: fmtNum(r.batteryLevel),
      temp: fmtNum(r.temperature),
      cpu: fmtNum(r.cpuUsage),
      ts: fmtNum(r.thermalStatus),
      th: fmtNum(r.thermalHeadroom),
      mm: fmtBool(r.monsterMode),
      ma: fmtNum(r.memAvailableMb),
      mt: fmtNum(r.memTotalMb),
      ic: fmtBool(r.isCharging),
      ct: r.chargingType ?? "",
      nt: r.networkType ?? "",
      cd: fmtNum(r.cellularDbm),
      wr: fmtNum(r.wifiRssi),
      rx: fmtNum(r.dataRxMb),
      tx: fmtNum(r.dataTxMb),
    });
  }
  styleHeader(ws);
}

function writeSensorsSheet(ws: ExcelJS.Worksheet, b: TeamBundle) {
  ws.columns = [
    { header: "periodStart", key: "ps", width: 22 },
    { header: "periodEnd", key: "pe", width: 22 },
    { header: "accelMean", key: "am", width: 12 },
    { header: "accelStddev", key: "as", width: 12 },
    { header: "accelPeak", key: "ap", width: 12 },
    { header: "gyroMean", key: "gm", width: 12 },
    { header: "gyroStddev", key: "gs", width: 12 },
    { header: "gyroPeak", key: "gp", width: 12 },
    { header: "magnetoMean", key: "mm", width: 12 },
    { header: "luxMean", key: "lu", width: 10 },
    { header: "proximityNearPct", key: "pn", width: 16 },
    { header: "stepsDelta", key: "sd", width: 12 },
  ];
  for (const r of b.sensors) {
    ws.addRow({
      ps: r.periodStart,
      pe: r.periodEnd,
      am: fmtNum(r.accelMean),
      as: fmtNum(r.accelStddev),
      ap: fmtNum(r.accelPeak),
      gm: fmtNum(r.gyroMean),
      gs: fmtNum(r.gyroStddev),
      gp: fmtNum(r.gyroPeak),
      mm: fmtNum(r.magnetoMean),
      lu: fmtNum(r.luxMean),
      pn: fmtNum(r.proximityNearPct),
      sd: fmtNum(r.stepsDelta),
    });
  }
  styleHeader(ws);
}

function writeCrashesSheet(ws: ExcelJS.Worksheet, b: TeamBundle) {
  ws.columns = [
    { header: "id", key: "id", width: 8 },
    { header: "occurredAt", key: "t", width: 22 },
    { header: "threadName", key: "tn", width: 18 },
    { header: "foregroundApp", key: "fa", width: 28 },
    { header: "reason", key: "r", width: 30 },
    { header: "stacktrace", key: "st", width: 100 },
  ];
  for (const c of b.crashes) {
    ws.addRow({
      id: c.id,
      t: c.occurredAt,
      tn: c.threadName ?? "",
      fa: c.foregroundApp ?? "",
      r: c.reason ?? "",
      st: c.stacktrace ?? "",
    });
  }
  styleHeader(ws);
  // Wrap stacktrace column so multi-line stacks stay readable.
  ws.getColumn("st").alignment = { wrapText: true, vertical: "top" };
}

function writeTamperSheet(ws: ExcelJS.Worksheet, b: TeamBundle) {
  ws.columns = [
    { header: "id", key: "id", width: 8 },
    { header: "type", key: "type", width: 22 },
    { header: "occurredAt", key: "t", width: 22 },
    { header: "resolvedAt", key: "rt", width: 22 },
    { header: "detail", key: "d", width: 80 },
  ];
  for (const t of b.tamper) {
    ws.addRow({
      id: t.id,
      type: t.type,
      t: t.occurredAt,
      rt: t.resolvedAt ?? "",
      d: fmtJson(t.detail),
    });
  }
  styleHeader(ws);
  ws.getColumn("d").alignment = { wrapText: true, vertical: "top" };
}

function writeScreenshotsSheet(
  ws: ExcelJS.Worksheet,
  b: TeamBundle,
  workbook: ExcelJS.Workbook
) {
  ws.columns = [
    { header: "id", key: "id", width: 8 },
    { header: "requestedAt", key: "rq", width: 22 },
    { header: "capturedAt", key: "cp", width: 22 },
    { header: "status", key: "st", width: 12 },
    { header: "skippedReason", key: "sr", width: 16 },
    { header: "imageUrl", key: "url", width: 32 },
    { header: "image", key: "img", width: 36 },
  ];
  styleHeader(ws);

  let row = 2;
  for (const s of b.screenshots) {
    ws.getRow(row).values = {
      id: s.id,
      rq: s.requestedAt,
      cp: s.capturedAt ?? "",
      st: s.status,
      sr: s.skippedReason ?? "",
      url: s.imageUrl ?? "",
      img: s.bytes ? "" : "(no image)",
    };
    if (s.bytes && (s.mime === "image/png" || s.mime === "image/jpeg" || s.mime === "image/webp")) {
      const extension =
        s.mime === "image/jpeg"
          ? "jpeg"
          : s.mime === "image/webp"
            ? // exceljs maps "png" | "jpeg" | "gif". Coerce webp → png label;
              // Excel still renders the bytes regardless of extension hint.
              "png"
            : "png";
      try {
        const imgId = workbook.addImage({
          buffer: Buffer.from(s.bytes) as unknown as ExcelJS.Buffer,
          extension,
        });
        ws.getRow(row).height = 180;
        ws.addImage(imgId, {
          tl: { col: 6, row: row - 1 }, // 0-indexed; col 6 = "image"
          ext: { width: 240, height: 180 },
        });
      } catch {
        ws.getCell(row, 7).value = "(embed failed)";
      }
    }
    row++;
  }
}

function writePerTeamSheets(
  workbook: ExcelJS.Workbook,
  prefix: string,
  bundle: TeamBundle
) {
  const sheets: Array<[string, (ws: ExcelJS.Worksheet) => void]> = [
    [`${prefix}-Summary`, (ws) => writeSummarySheet(ws, bundle)],
    [`${prefix}-Members`, (ws) => writeMembersSheet(ws, bundle)],
    [`${prefix}-Timeline`, (ws) => writeTimelineSheet(ws, bundle)],
    [`${prefix}-AppUsage`, (ws) => writeAppUsageSheet(ws, bundle)],
    [`${prefix}-Vitals`, (ws) => writeVitalsSheet(ws, bundle)],
    [`${prefix}-Sensors`, (ws) => writeSensorsSheet(ws, bundle)],
    [`${prefix}-Crashes`, (ws) => writeCrashesSheet(ws, bundle)],
    [`${prefix}-Tamper`, (ws) => writeTamperSheet(ws, bundle)],
    [
      `${prefix}-Screenshots`,
      (ws) => writeScreenshotsSheet(ws, bundle, workbook),
    ],
  ];
  for (const [rawName, fill] of sheets) {
    const ws = workbook.addWorksheet(safeSheetName(rawName));
    fill(ws);
  }
}

// -----------------------------------------------------------------------------
// Public renderers

export async function renderTeamXlsx(bundle: TeamBundle): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "HackTracker";
  workbook.created = new Date();
  workbook.modified = workbook.created;
  workbook.title = `HackTracker — ${bundle.team.name}`;

  const ws = workbook.addWorksheet("Summary");
  writeSummarySheet(ws, bundle);
  writeMembersSheet(workbook.addWorksheet("Members"), bundle);
  writeTimelineSheet(workbook.addWorksheet("Timeline"), bundle);
  writeAppUsageSheet(workbook.addWorksheet("AppUsage"), bundle);
  writeVitalsSheet(workbook.addWorksheet("DeviceVitals"), bundle);
  writeSensorsSheet(workbook.addWorksheet("SensorAggregates"), bundle);
  writeCrashesSheet(workbook.addWorksheet("Crashes"), bundle);
  writeTamperSheet(workbook.addWorksheet("TamperEvents"), bundle);
  writeScreenshotsSheet(workbook.addWorksheet("Screenshots"), bundle, workbook);

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

export async function renderHackathonXlsx(
  bundle: HackathonBundle
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "HackTracker";
  workbook.created = new Date();
  workbook.modified = workbook.created;
  workbook.title = `HackTracker — ${bundle.hackathon.name}`;

  // Hackathon KV sheet
  const hk = workbook.addWorksheet("Hackathon");
  hk.columns = [
    { header: "Field", key: "k", width: 24 },
    { header: "Value", key: "v", width: 70 },
  ];
  hk.addRows([
    { k: "Hackathon ID", v: bundle.hackathon.id },
    { k: "Name", v: bundle.hackathon.name },
    { k: "Status", v: bundle.hackathon.status },
    { k: "Start", v: bundle.hackathon.startTime },
    { k: "End", v: bundle.hackathon.endTime },
    { k: "Venue light", v: bundle.hackathon.currentLight },
    { k: "Teams", v: bundle.teams.length },
    { k: "Generated at", v: bundle.generatedAt },
    {
      k: "Scoring config",
      v: fmtJson(bundle.hackathon.scoringConfig),
    },
  ]);
  styleHeader(hk);

  // Leaderboard
  const lb = workbook.addWorksheet("Leaderboard");
  const lbCols: Array<{ header: string; key: string; width: number }> = [
    { header: "rank", key: "rank", width: 6 },
    { header: "teamId", key: "tid", width: 16 },
    { header: "teamName", key: "tname", width: 24 },
    { header: "buildScore", key: "bs", width: 12 },
    { header: "buildScoreRaw", key: "bsr", width: 14 },
    { header: "mostActive", key: "ma", width: 12 },
    { header: "mostOfficeKit", key: "mok", width: 14 },
    { header: "mostResilient", key: "mr", width: 14 },
  ];
  for (const c of CONTRIBUTORS) {
    lbCols.push(
      { header: `${c}_raw`, key: `${c}_raw`, width: 14 },
      { header: `${c}_norm`, key: `${c}_norm`, width: 14 },
      { header: `${c}_contrib`, key: `${c}_contrib`, width: 14 }
    );
  }
  lb.columns = lbCols;
  for (const r of bundle.rankings) {
    const row: Record<string, unknown> = {
      rank: r.rank,
      tid: r.teamId,
      tname: r.teamName,
      bs: r.buildScore,
      bsr: r.buildScoreRaw,
      ma: r.mostActive,
      mok: r.mostOfficeKit,
      mr: r.mostResilient,
    };
    for (const c of CONTRIBUTORS) {
      row[`${c}_raw`] = r.breakdown[c].raw;
      row[`${c}_norm`] = r.breakdown[c].normalized ?? "";
      row[`${c}_contrib`] = r.breakdown[c].contribution;
    }
    lb.addRow(row);
  }
  styleHeader(lb);

  // Weights
  const w = workbook.addWorksheet("Weights");
  w.columns = [
    { header: "contributor", key: "c", width: 28 },
    { header: "label", key: "l", width: 34 },
    { header: "weight", key: "v", width: 10 },
  ];
  for (const c of CONTRIBUTORS) {
    w.addRow({ c, l: CONTRIBUTOR_LABELS[c], v: bundle.weights[c] });
  }
  styleHeader(w);

  // Light transitions
  const lt = workbook.addWorksheet("LightTransitions");
  lt.columns = [
    { header: "id", key: "id", width: 8 },
    { header: "changedAt", key: "t", width: 22 },
    { header: "light", key: "lg", width: 10 },
    { header: "changedBy", key: "by", width: 28 },
  ];
  for (const r of bundle.lightTransitions) {
    lt.addRow({ id: r.id, t: r.changedAt, lg: r.light, by: r.changedBy ?? "" });
  }
  styleHeader(lt);

  // Notifications
  const nt = workbook.addWorksheet("Notifications");
  nt.columns = [
    { header: "id", key: "id", width: 8 },
    { header: "createdAt", key: "t", width: 22 },
    { header: "targetFilter", key: "tf", width: 16 },
    { header: "targetMinTaps", key: "min", width: 14 },
    { header: "targetMaxTaps", key: "max", width: 14 },
    { header: "targetTeamIds", key: "tid", width: 30 },
    { header: "title", key: "title", width: 30 },
    { header: "message", key: "msg", width: 60 },
  ];
  for (const n of bundle.notifications) {
    nt.addRow({
      id: n.id,
      t: n.createdAt,
      tf: n.targetFilter,
      min: fmtNum(n.targetMinTaps),
      max: fmtNum(n.targetMaxTaps),
      tid: n.targetTeamIds?.join(",") ?? "",
      title: n.title,
      msg: n.message,
    });
  }
  styleHeader(nt);
  nt.getColumn("msg").alignment = { wrapText: true, vertical: "top" };

  // Teams index
  const tx = workbook.addWorksheet("Teams");
  tx.columns = [
    { header: "teamId", key: "id", width: 18 },
    { header: "teamName", key: "name", width: 24 },
    { header: "buildRank", key: "br", width: 10 },
    { header: "buildScore", key: "bs", width: 12 },
    { header: "memberCount", key: "mc", width: 12 },
    { header: "deviceId", key: "dev", width: 24 },
    { header: "status", key: "st", width: 12 },
    { header: "lastHeartbeat", key: "lh", width: 22 },
    { header: "batteryLevel", key: "b", width: 12 },
    { header: "temperature", key: "temp", width: 12 },
    { header: "taps", key: "taps", width: 10 },
    { header: "textInputs", key: "tx", width: 12 },
    { header: "scrolls", key: "sc", width: 10 },
    { header: "appSwitches", key: "as", width: 12 },
    { header: "kbActiveSec", key: "kb", width: 12 },
    { header: "officeKitSec", key: "ok", width: 12 },
    { header: "cameraOpens", key: "co", width: 12 },
    { header: "clipboardEvents", key: "ce", width: 14 },
    { header: "crashCount", key: "cc", width: 12 },
    { header: "tamperCount", key: "tc", width: 12 },
    { header: "longestSessionMin", key: "ls", width: 18 },
  ];
  for (const b of bundle.teams) {
    tx.addRow({
      id: b.team.id,
      name: b.team.name,
      br: b.buildRank ?? "",
      bs: b.buildScore ?? "",
      mc: b.membersDetail.length,
      dev: b.team.deviceId ?? "",
      st: b.status,
      lh: b.heartbeat?.lastSeen ?? "",
      b: fmtNum(b.heartbeat?.batteryLevel ?? null),
      temp: fmtNum(b.heartbeat?.temperature ?? null),
      taps: b.totals.taps,
      tx: b.totals.textInputs,
      sc: b.totals.scrolls,
      as: b.totals.appSwitches,
      kb: b.totals.keyboardActiveSeconds,
      ok: b.totals.officeKitSeconds,
      co: b.totals.cameraOpens,
      ce: b.totals.clipboardEvents,
      cc: b.totals.crashCount,
      tc: b.totals.tamperCount,
      ls: b.totals.longestSessionMinutes,
    });
  }
  styleHeader(tx);

  // Per-team sheet groups
  for (const t of bundle.teams) {
    writePerTeamSheets(workbook, `T-${t.team.id}`, t);
  }

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

// Leaderboard-only workbook — Rankings + Weights + per-team Members. Skips
// the heavy per-team sheets.
export async function renderLeaderboardXlsx(
  bundle: LeaderboardBundle
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "HackTracker";
  workbook.created = new Date();
  workbook.modified = workbook.created;
  workbook.title = `HackTracker Leaderboard — ${bundle.hackathon.name}`;

  // Hackathon header
  const hk = workbook.addWorksheet("Hackathon");
  hk.columns = [
    { header: "Field", key: "k", width: 24 },
    { header: "Value", key: "v", width: 70 },
  ];
  hk.addRows([
    { k: "Hackathon ID", v: bundle.hackathon.id },
    { k: "Name", v: bundle.hackathon.name },
    { k: "Status", v: bundle.hackathon.status },
    { k: "Start", v: bundle.hackathon.startTime },
    { k: "End", v: bundle.hackathon.endTime },
    { k: "Venue light", v: bundle.hackathon.currentLight },
    { k: "Teams", v: bundle.teams.length },
    { k: "Generated at", v: bundle.generatedAt },
  ]);
  styleHeader(hk);

  // Rankings — same shape as the full hackathon export's Leaderboard sheet.
  const lb = workbook.addWorksheet("Rankings");
  const lbCols: Array<{ header: string; key: string; width: number }> = [
    { header: "rank", key: "rank", width: 6 },
    { header: "teamId", key: "tid", width: 16 },
    { header: "teamName", key: "tname", width: 24 },
    { header: "buildScore", key: "bs", width: 12 },
    { header: "buildScoreRaw", key: "bsr", width: 14 },
    { header: "mostActive", key: "ma", width: 12 },
    { header: "mostOfficeKit", key: "mok", width: 14 },
    { header: "mostResilient", key: "mr", width: 14 },
  ];
  for (const c of CONTRIBUTORS) {
    lbCols.push(
      { header: `${c}_raw`, key: `${c}_raw`, width: 14 },
      { header: `${c}_norm`, key: `${c}_norm`, width: 14 },
      { header: `${c}_contrib`, key: `${c}_contrib`, width: 14 }
    );
  }
  lb.columns = lbCols;
  for (const r of bundle.rankings) {
    const row: Record<string, unknown> = {
      rank: r.rank,
      tid: r.teamId,
      tname: r.teamName,
      bs: r.buildScore,
      bsr: r.buildScoreRaw,
      ma: r.mostActive,
      mok: r.mostOfficeKit,
      mr: r.mostResilient,
    };
    for (const c of CONTRIBUTORS) {
      row[`${c}_raw`] = r.breakdown[c].raw;
      row[`${c}_norm`] = r.breakdown[c].normalized ?? "";
      row[`${c}_contrib`] = r.breakdown[c].contribution;
    }
    lb.addRow(row);
  }
  styleHeader(lb);

  // Weights
  const w = workbook.addWorksheet("Weights");
  w.columns = [
    { header: "contributor", key: "c", width: 28 },
    { header: "label", key: "l", width: 34 },
    { header: "weight", key: "v", width: 10 },
  ];
  for (const c of CONTRIBUTORS) {
    w.addRow({ c, l: CONTRIBUTOR_LABELS[c], v: bundle.weights[c] });
  }
  styleHeader(w);

  // One flat Members sheet — every team's members in rank order, easy to
  // pivot in Excel.
  const members = workbook.addWorksheet("Members");
  members.columns = [
    { header: "rank", key: "rank", width: 6 },
    { header: "teamId", key: "tid", width: 16 },
    { header: "teamName", key: "tname", width: 22 },
    { header: "slot", key: "slot", width: 6 },
    { header: "memberName", key: "name", width: 22 },
    { header: "deviceId", key: "dev", width: 24 },
    { header: "status", key: "st", width: 10 },
    { header: "lastSeen", key: "ls", width: 22 },
    { header: "batteryLevel", key: "bat", width: 12 },
    { header: "taps", key: "taps", width: 10 },
    { header: "textInputs", key: "tx", width: 12 },
    { header: "scrolls", key: "sc", width: 10 },
    { header: "appSwitches", key: "as", width: 12 },
    { header: "keyboardActiveSec", key: "kb", width: 18 },
    { header: "officeKitSec", key: "ok", width: 14 },
    { header: "crashCount", key: "cc", width: 12 },
  ];
  for (const t of bundle.teams) {
    for (const m of t.membersDetail) {
      members.addRow({
        rank: t.rank,
        tid: t.teamId,
        tname: t.teamName,
        slot: m.slot,
        name: m.memberName,
        dev: m.deviceId ?? "",
        st: m.status,
        ls: m.lastSeen ?? "",
        bat: fmtNum(m.batteryLevel),
        taps: m.totals.taps,
        tx: m.totals.textInputs,
        sc: m.totals.scrolls,
        as: m.totals.appSwitches,
        kb: m.totals.keyboardActiveSeconds,
        ok: m.totals.officeKitSeconds,
        cc: m.totals.crashCount,
      });
    }
  }
  styleHeader(members);

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

// Helper export used in tests / verification.
export { safeSheetName };
