// Shapes consumed by the PDF and XLSX renderers. Both renderers MUST accept a
// fully-resolved bundle — there is no DB / network access inside renderers.
import type { ScoredTeam, Weights } from "@/lib/scoring";

export interface MemberTotals {
  taps: number;
  textInputs: number;
  scrolls: number;
  appSwitches: number;
  keyboardActiveSeconds: number;
  officeKitSeconds: number;
  crashCount: number;
}

export interface TeamMemberDetail {
  slot: number;
  memberName: string;
  deviceId: string | null;
  lastSeen: string | null;
  batteryLevel: number | null;
  status: "active" | "idle" | "offline" | "crashed";
  totals: MemberTotals;
}

export interface ScreenshotPayload {
  id: number;
  requestedAt: string;
  capturedAt: string | null;
  status: "pending" | "captured" | "failed";
  imageUrl: string | null;
  bytes: Uint8Array | null;   // null if not captured / fetch failed / too large
  mime: string | null;        // "image/png" | "image/jpeg" | "image/webp"
  skippedReason?: "no-bytes" | "too-large" | "fetch-error";
}

export interface BundleHackathon {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  currentLight: "green" | "red";
  status: string;
  scoringConfig: unknown;
}

export interface TimelineRow {
  periodStart: string;
  periodEnd: string;
  taps: number | null;
  textInputs: number | null;
  scrolls: number | null;
  appSwitches: number | null;
  keyboardActiveSeconds: number | null;
  officeKitSeconds: number | null;
  foregroundApp: string | null;
  perAppTaps: Record<string, number> | null;
}

export interface AppUsageRow {
  appPackage: string;
  appLabel: string | null;
  foregroundMinutes: number;
  openCount: number;
}

export interface VitalsRow {
  recordedAt: string;
  batteryLevel: number | null;
  temperature: number | null;
  cpuUsage: number | null;
  thermalStatus: number | null;
  thermalHeadroom: number | null;
  monsterMode: boolean | null;
  memAvailableMb: number | null;
  memTotalMb: number | null;
  isCharging: boolean | null;
  chargingType: string | null;
  networkType: string | null;
  cellularDbm: number | null;
  wifiRssi: number | null;
  dataRxMb: number | null;
  dataTxMb: number | null;
}

export interface SensorRow {
  periodStart: string;
  periodEnd: string;
  accelMean: number | null;
  accelStddev: number | null;
  accelPeak: number | null;
  gyroMean: number | null;
  gyroStddev: number | null;
  gyroPeak: number | null;
  magnetoMean: number | null;
  luxMean: number | null;
  proximityNearPct: number | null;
  stepsDelta: number | null;
}

export interface CrashRow {
  id: number;
  occurredAt: string;
  threadName: string | null;
  stacktrace: string | null;
  foregroundApp: string | null;
  reason: string | null;
}

export interface TamperRow {
  id: number;
  type: string;
  detail: unknown;
  occurredAt: string;
  resolvedAt: string | null;
}

export interface TeamBundle {
  generatedAt: string;
  hackathon: BundleHackathon;
  team: {
    id: string;
    name: string;
    deviceId: string | null;
    members: Array<{ name: string; role?: string }> | null;
    createdAt: string | null;
  };
  status: "active" | "idle" | "offline" | "crashed";
  heartbeat: {
    lastSeen: string | null;
    batteryLevel: number | null;
    temperature: number | null;
    lastCleanExit: boolean;
  } | null;
  totals: {
    taps: number;
    textInputs: number;
    scrolls: number;
    appSwitches: number;
    keyboardActiveSeconds: number;
    officeKitSeconds: number;
    cameraOpens: number;
    clipboardEvents: number;
    crashCount: number;
    tamperCount: number;
    longestSessionMinutes: number;
  };
  // Composite team build score from /lib/scoring. Always null on the
  // standalone team route (single team can't be normalised in isolation);
  // populated when assembled inside a hackathon bundle so the leaderboard
  // ranking flows into the per-team PDF/XLSX.
  buildScore: number | null;
  buildRank: number | null;
  // Per-device breakdown of the team's effort. Slot 1 / Slot 2 / etc.
  membersDetail: TeamMemberDetail[];
  timeline: TimelineRow[];
  appUsage: AppUsageRow[];
  vitals: VitalsRow[];
  sensors: SensorRow[];
  crashes: CrashRow[];   // every crash — no 200 cap
  tamper: TamperRow[];   // every tamper event — no 200 cap
  screenshots: ScreenshotPayload[]; // capped at MAX_SCREENSHOTS_PER_TEAM
}

export interface LightTransitionRow {
  id: number;
  light: string;
  changedAt: string;
  changedBy: string | null;
}

export interface NotificationRow {
  id: number;
  title: string;
  message: string;
  targetFilter: string;
  targetMinTaps: number | null;
  targetMaxTaps: number | null;
  targetTeamIds: string[] | null;
  createdAt: string;
}

export interface HackathonBundle {
  generatedAt: string;
  hackathon: BundleHackathon;
  rankings: ScoredTeam[];
  weights: Weights;
  lightTransitions: LightTransitionRow[];
  notifications: NotificationRow[];
  teams: TeamBundle[]; // one per team, screenshot-capped each
}

// Lightweight bundle backing the leaderboard-only export. Carries every
// team's ranking + the per-member breakdown but skips heavy per-team
// sections (timelines, vitals ticks, screenshots) so the file stays small
// and the renderer fast.
export interface LeaderboardTeam {
  teamId: string;
  teamName: string;
  deviceId: string | null;
  status: "active" | "idle" | "offline" | "crashed";
  rank: number;
  buildScore: number;
  totals: {
    taps: number;
    textInputs: number;
    scrolls: number;
    appSwitches: number;
    keyboardActiveSeconds: number;
    officeKitSeconds: number;
    crashCount: number;
  };
  membersDetail: TeamMemberDetail[];
}

export interface LeaderboardBundle {
  generatedAt: string;
  hackathon: BundleHackathon;
  rankings: ScoredTeam[];
  weights: Weights;
  teams: LeaderboardTeam[]; // same order as rankings (rank 1 first)
}
