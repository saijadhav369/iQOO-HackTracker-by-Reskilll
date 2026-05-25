// Feature 8 — Composite build-score leaderboard (hardware-stress edition).
// Pure module: no DB / framework imports. Easy to test in isolation.

export const CONTRIBUTORS = [
  "officeKitMinutes",
  "compileSpikes",
  "typingDensity",
  "batteryDrainRate",
  "thermalHeadroom",
  "hardwareRedline",
  "monsterModeMinutes",
  "crashCount",
  "idleWarningCount",
] as const;

export type Contributor = (typeof CONTRIBUTORS)[number];

export type Weights = Record<Contributor, number>;

// Positive weights sum to 1.00; penalties are subtracted directly (raw count × weight).
export const DEFAULT_WEIGHTS: Weights = {
  officeKitMinutes: 0.30,
  compileSpikes: 0.15,
  typingDensity: 0.15,
  batteryDrainRate: 0.10,
  thermalHeadroom: 0.10,
  hardwareRedline: 0.10,
  monsterModeMinutes: 0.10,
  crashCount: 0.10,
  idleWarningCount: 0.10,
};

export const CONTRIBUTORS_NORMALIZED: Contributor[] = [
  "officeKitMinutes",
  "compileSpikes",
  "typingDensity",
  "batteryDrainRate",
  "thermalHeadroom",
  "hardwareRedline",
  "monsterModeMinutes",
];

export const CONTRIBUTORS_PENALTY: Contributor[] = [
  "crashCount",
  "idleWarningCount",
];

export interface ScoringConfig {
  weights?: Partial<Weights>;
  // Accessibility-classname substrings that mark the iQOO Office Kit window.
  // Server doesn't use this directly (Android matches it), kept for parity.
  office_kit_class_patterns?: string[];
}

export interface TeamRawMetrics {
  teamId: string;
  teamName: string;
  officeKitMinutes: number; // sum(event_batches.office_kit_seconds) / 60
  compileSpikes: number; // count of consecutive cpu/mem-pressure jumps > threshold
  typingDensity: number; // text_inputs + keyboard_active_seconds (velocity unavailable → proxy)
  batteryDrainRate: number; // % battery drained per observed hour
  thermalHeadroom: number; // max getThermalHeadroom() seen (higher = closer to throttle = more intense)
  hardwareRedline: number; // count of vitals samples at thermal_status >= SEVERE
  monsterModeMinutes: number; // distinct minutes monster_mode was true
  crashCount: number;
  idleWarningCount: number;
}

export interface ContributorBreakdown {
  raw: number;
  normalized: number | null;
  contribution: number;
}

export interface ScoredTeam {
  teamId: string;
  teamName: string;
  buildScore: number; // floored at 0
  buildScoreRaw: number; // sum of all contributions, may be negative
  rank: number;
  breakdown: Record<Contributor, ContributorBreakdown>;
  // Alternate-tab sort keys
  mostActive: number; // typing density
  mostOfficeKit: number; // raw office kit minutes
  mostResilient: number; // -(crashes + warnings)
}

export const CONTRIBUTOR_LABELS: Record<Contributor, string> = {
  officeKitMinutes: "Office Kit minutes",
  compileSpikes: "Compile spikes",
  typingDensity: "Typing density",
  batteryDrainRate: "Battery drain rate (%/hr)",
  thermalHeadroom: "Thermal headroom",
  hardwareRedline: "Hardware redline (severe)",
  monsterModeMinutes: "Performance mode minutes",
  crashCount: "Crash count (penalty)",
  idleWarningCount: "Idle warnings (penalty)",
};

// Min-max normalize. When max == min the spread is zero — we cannot fairly
// award or penalise any team, so we return nulls and skip that contributor's
// effect on every team's score. The UI renders these as "—".
export function normalize(values: number[]): {
  normalized: (number | null)[];
  denomZero: boolean;
} {
  if (values.length === 0) {
    return { normalized: [], denomZero: true };
  }
  let min = values[0];
  let max = values[0];
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const spread = max - min;
  if (spread === 0) {
    return { normalized: values.map(() => null), denomZero: true };
  }
  return {
    normalized: values.map((v) => (v - min) / spread),
    denomZero: false,
  };
}

function mergeWeights(override?: Partial<Weights>): Weights {
  if (!override) return DEFAULT_WEIGHTS;
  return { ...DEFAULT_WEIGHTS, ...override };
}

export function computeBuildScores(
  teams: TeamRawMetrics[],
  config?: ScoringConfig | null
): { rankings: ScoredTeam[]; weights: Weights } {
  const weights = mergeWeights(config?.weights);

  // Normalize each "good" contributor across the team population.
  const normalized = {} as Record<Contributor, (number | null)[]>;
  for (const key of CONTRIBUTORS_NORMALIZED) {
    normalized[key] = normalize(teams.map((t) => t[key])).normalized;
  }

  const scored: ScoredTeam[] = teams.map((team, idx) => {
    const breakdown = {} as Record<Contributor, ContributorBreakdown>;
    let buildScore = 0;

    for (const key of CONTRIBUTORS_NORMALIZED) {
      const n = normalized[key][idx];
      const w = weights[key];
      const contribution = n === null ? 0 : n * w;
      buildScore += contribution;
      breakdown[key] = { raw: team[key], normalized: n, contribution };
    }

    for (const key of CONTRIBUTORS_PENALTY) {
      const raw = team[key];
      const contribution = -raw * weights[key];
      buildScore += contribution;
      breakdown[key] = { raw, normalized: null, contribution };
    }

    return {
      teamId: team.teamId,
      teamName: team.teamName,
      // Floor at 0 so the public scoreboard never displays a negative.
      // The breakdown still shows raw negative penalties and the raw sum.
      buildScore: Math.max(0, buildScore),
      buildScoreRaw: buildScore,
      rank: 0,
      breakdown,
      mostActive: team.typingDensity,
      mostOfficeKit: team.officeKitMinutes,
      mostResilient: -(team.crashCount + team.idleWarningCount),
    };
  });

  scored.sort((a, b) => b.buildScore - a.buildScore);
  scored.forEach((t, i) => {
    t.rank = i + 1;
  });

  return { rankings: scored, weights };
}
