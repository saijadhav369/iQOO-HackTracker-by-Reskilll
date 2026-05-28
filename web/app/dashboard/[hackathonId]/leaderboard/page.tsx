"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  CONTRIBUTORS,
  CONTRIBUTOR_LABELS,
  type Contributor,
  type ContributorBreakdown,
  type ScoredTeam,
  type Weights,
} from "@/lib/scoring";
import ExportButton from "@/components/export-button";

const POLL_MS = 30_000;

type SortKey = "buildScore" | "mostActive" | "mostOfficeKit" | "mostResilient";

const TABS: { key: SortKey; label: string }[] = [
  { key: "buildScore", label: "Build Score" },
  { key: "mostActive", label: "Most Active" },
  { key: "mostOfficeKit", label: "Most Office Kit" },
  { key: "mostResilient", label: "Most Resilient" },
];

interface MemberScore {
  slot: number;
  memberName: string;
  deviceId: string;
  buildScore: number;
  buildScoreRaw: number;
  rank: number;
  breakdown: Record<Contributor, ContributorBreakdown>;
}

interface LeaderboardResponse {
  rankings: ScoredTeam[];
  weights: Weights;
  generatedAt: string;
  membersByTeam: Record<string, MemberScore[]>;
}

function formatRaw(contributor: Contributor, raw: number): string {
  switch (contributor) {
    case "officeKitMinutes":
    case "monsterModeMinutes":
      return `${Math.round(raw)} min`;
    case "batteryDrainRate":
      return `${raw.toFixed(2)} %/hr`;
    case "thermalHeadroom":
      return raw.toFixed(2);
    case "compileSpikes":
    case "typingDensity":
    case "hardwareRedline":
    case "crashCount":
    case "idleWarningCount":
      return Math.round(raw).toLocaleString();
  }
}

function formatNormalized(n: number | null): string {
  return n === null ? "—" : n.toFixed(2);
}

function formatContribution(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(3)}`;
}

// Reusable breakdown table — works for both team-level and per-member scores
// (both expose `breakdown` + `buildScoreRaw` of the same shape).
function BreakdownTable({
  entry,
  weights,
  compact = false,
}: {
  entry: { breakdown: Record<Contributor, ContributorBreakdown>; buildScoreRaw: number };
  weights: Weights;
  compact?: boolean;
}) {
  const padX = compact ? "px-4" : "px-6";
  const padY = compact ? "py-3" : "py-5";
  return (
    <div className={`border-t border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02] ${padX} ${padY} text-[10px] font-black uppercase tracking-widest`}>
      <div className="grid grid-cols-12 gap-2 text-gray-400 mb-4 opacity-70">
        <div className="col-span-5">Contributor</div>
        <div className="col-span-2 text-right">Weight</div>
        <div className="col-span-2 text-right">Raw</div>
        <div className="col-span-1 text-right">Norm</div>
        <div className="col-span-2 text-right">Score</div>
      </div>
      <div className="space-y-3">
        {CONTRIBUTORS.map((c) => {
          const b = entry.breakdown[c];
          const isPenalty = c === "crashCount" || c === "idleWarningCount";
          return (
            <div
              key={c}
              className="grid grid-cols-12 gap-2 items-center"
            >
              <div className="col-span-5 truncate text-foreground/80">{CONTRIBUTOR_LABELS[c]}</div>
              <div className="col-span-2 text-right tabular-nums opacity-50">
                {isPenalty ? "−" : ""}
                {weights[c].toFixed(2)}
              </div>
              <div className="col-span-2 text-right tabular-nums opacity-50">
                {formatRaw(c, b.raw)}
              </div>
              <div className="col-span-1 text-right tabular-nums opacity-50">
                {formatNormalized(b.normalized)}
              </div>
              <div
                className={`col-span-2 text-right tabular-nums font-black ${
                  b.contribution < 0
                    ? "text-red-500"
                    : b.contribution > 0
                      ? "text-primary"
                      : "text-gray-500"
                }`}
              >
                {formatContribution(b.contribution)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-12 gap-2 pt-5 mt-5 border-t border-black/5 dark:border-white/5 font-black text-sm">
        <div className="col-span-10 text-right opacity-50">Total Build Score</div>
        <div className="col-span-2 text-right tabular-nums text-primary">
          {entry.buildScoreRaw.toFixed(3)}
        </div>
      </div>
    </div>
  );
}

// Per-member sub-accordion shown beneath each team's BreakdownTable.
function MembersSection({
  members,
  weights,
}: {
  members: MemberScore[];
  weights: Weights;
}) {
  const [openSlot, setOpenSlot] = useState<number | null>(null);
  if (members.length === 0) {
    return (
      <div className="border-t border-black/5 dark:border-white/5 px-6 py-5 text-[10px] font-black uppercase tracking-widest opacity-50">
        No members registered for this team yet.
      </div>
    );
  }
  return (
    <div className="border-t border-black/5 dark:border-white/5 px-6 py-5">
      <div className="text-[10px] font-black uppercase tracking-widest text-primary mb-3 opacity-80">
        Members ({members.length})
      </div>
      <div className="flex flex-col gap-2">
        {members.map((m) => {
          const open = openSlot === m.slot;
          return (
            <div
              key={`${m.slot}|${m.deviceId}`}
              className={`rounded-xl border transition-all overflow-hidden ${
                open
                  ? "border-primary/60 bg-primary/[0.04]"
                  : "border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02] hover:border-primary/30"
              }`}
            >
              <button
                type="button"
                onClick={() => setOpenSlot(open ? null : m.slot)}
                className="w-full flex items-center gap-4 px-4 py-3 text-left group"
              >
                <span className="text-[10px] font-black uppercase tracking-widest tabular-nums w-12 opacity-50">
                  M{m.slot}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-black uppercase tracking-tight truncate">
                    {m.memberName}
                  </div>
                  <div className="text-[9px] tabular-nums opacity-40 font-mono truncate">
                    {m.deviceId}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-black tabular-nums tracking-tighter">
                    {m.buildScore.toFixed(3)}
                  </div>
                  <div className="text-[9px] text-gray-400 font-black uppercase tracking-widest opacity-60">
                    Score #{m.rank}
                  </div>
                </div>
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center bg-black/5 dark:bg-white/5 transition-transform duration-300 ${
                    open ? "rotate-180 bg-primary text-black" : ""
                  }`}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>
              {open && <BreakdownTable entry={m} weights={weights} compact />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TeamRow({
  team,
  index,
  sortKey,
  weights,
  members,
}: {
  team: ScoredTeam;
  index: number;
  sortKey: SortKey;
  weights: Weights;
  members: MemberScore[];
}) {
  const [open, setOpen] = useState(false);

  const headlineValue = (() => {
    switch (sortKey) {
      case "buildScore":
        return team.buildScore.toFixed(3);
      case "mostActive":
        return team.mostActive.toLocaleString();
      case "mostOfficeKit":
        return `${Math.round(team.mostOfficeKit)}m`;
      case "mostResilient":
        return `${team.breakdown.crashCount.raw + team.breakdown.idleWarningCount.raw}`;
    }
  })();

  const headlineLabel = (() => {
    switch (sortKey) {
      case "buildScore":
        return "Score";
      case "mostActive":
        return "Typing";
      case "mostOfficeKit":
        return "Office";
      case "mostResilient":
        return "Demerits";
    }
  })();

  return (
    <div className={`rounded-2xl border-2 transition-all duration-300 overflow-hidden ${
      open ? "border-primary bg-white dark:bg-black shadow-2xl" : "border-black/5 dark:border-white/5 bg-white dark:bg-white/5 hover:border-primary/30"
    }`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-6 px-6 py-5 text-left group"
      >
        <div className="relative">
          <span className="text-2xl font-black tabular-nums w-12 text-gray-200 dark:text-white/10 group-hover:text-primary/20 transition-colors">
            {String(index + 1).padStart(2, '0')}
          </span>
          {index < 3 && (
            <div className="absolute -top-1 -left-1 w-2 h-2 rounded-full bg-primary" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-black uppercase tracking-tight truncate text-lg">
            {team.teamName}
          </div>
          <div className="text-[10px] text-primary font-black uppercase tracking-[0.2em] opacity-50">
            Rank #{team.rank} OVERALL
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-3xl font-black tabular-nums tracking-tighter group-hover:text-primary transition-colors">{headlineValue}</div>
          <div className="text-[9px] text-gray-400 font-black uppercase tracking-widest mt-1 opacity-60">
            {headlineLabel}
          </div>
        </div>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center bg-black/5 dark:bg-white/5 transition-transform duration-300 ${open ? 'rotate-180 bg-primary text-black' : 'group-hover:bg-primary/10 group-hover:text-primary'}`}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {open && (
        <>
          <BreakdownTable entry={team} weights={weights} />
          <MembersSection members={members} weights={weights} />
        </>
      )}
    </div>
  );
}

import Image from "next/image";

export default function LeaderboardPage() {
  const params = useParams();
  const hackathonId = params.hackathonId as string;
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("buildScore");
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/hackathon/${hackathonId}/leaderboard`,
        { cache: "no-store" }
      );
      if (res.ok) {
        setData(await res.json());
        setError(null);
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `HTTP ${res.status}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [hackathonId]);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, POLL_MS);
    return () => clearInterval(t);
  }, [fetchData]);

  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data.rankings].sort((a, b) => b[sortKey] - a[sortKey]);
  }, [data, sortKey]);

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#050505]">
      <header className="sticky top-0 z-40 border-b border-black/5 dark:border-primary/20 bg-white/80 dark:bg-black/80 backdrop-blur-md px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a
              href={`/dashboard/${hackathonId}`}
              className="flex items-center justify-center h-10 w-10 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-primary hover:text-black transition-all group"
            >
              <span className="group-hover:-translate-x-0.5 transition-transform font-black">&larr;</span>
            </a>
            <div className="flex items-center gap-3">
              <Image
                src="/HackTracker.png"
                alt="Logo"
                width={40}
                height={40}
                className="rounded-lg"
              />
              <div>
                <h1 className="text-xl font-black uppercase tracking-tighter leading-none">Leaderboard</h1>
                <p className="text-[10px] text-primary font-black uppercase tracking-widest mt-1 opacity-80">{hackathonId}</p>
              </div>
            </div>
          </div>
          <ExportButton scope="leaderboard" hackathonId={hackathonId} />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center gap-2 mb-10 bg-black/5 dark:bg-white/5 p-1.5 rounded-2xl w-fit flex-wrap">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setSortKey(key)}
              className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all duration-300 ${
                sortKey === key
                  ? "bg-primary text-black shadow-lg shadow-primary/20"
                  : "text-gray-500 hover:text-black dark:hover:text-primary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20 text-gray-400 font-black uppercase tracking-widest text-xs animate-pulse">
            Calculating scores...
          </div>
        )}

        {error && !loading && (
          <div className="rounded-2xl border-2 border-red-500/20 bg-red-500/10 px-6 py-4 text-xs text-red-500 font-black uppercase tracking-widest">
            {error}
          </div>
        )}

        {!loading && !error && data && sorted.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-4">
            <div className="h-20 w-20 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center">
              <span className="text-2xl opacity-20">?</span>
            </div>
            <p className="font-black uppercase tracking-widest text-xs opacity-50">No teams registered yet</p>
          </div>
        )}

        {!loading && data && sorted.length > 0 && (
          <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {sorted.map((team, idx) => (
              <TeamRow
                key={team.teamId}
                team={team}
                index={idx}
                sortKey={sortKey}
                weights={data.weights}
                members={data.membersByTeam?.[team.teamId] ?? []}
              />
            ))}
          </div>
        )}

        {data && (
          <p className="mt-12 text-center text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] opacity-40">
            Last updated {new Date(data.generatedAt).toLocaleTimeString()}
          </p>
        )}
      </main>
    </div>
  );
}
