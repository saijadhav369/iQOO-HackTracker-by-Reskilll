"use client";

import { useEffect, useState, useCallback } from "react";
import TeamCard from "./team-card";

interface MemberState {
  slot: number;
  member_name: string;
  device_id: string;
  online: boolean;
  last_heartbeat: string | null;
  battery_level: number | null;
}

interface TeamData {
  team_id: string;
  team_name: string;
  total_taps: number;
  total_text_inputs: number;
  total_scrolls: number;
  total_app_switches: number;
  total_keyboard_seconds: number;
  current_app: string | null;
  office_kit_minutes: number;
  camera_opens: number;
  last_heartbeat: string | null;
  battery_level: number | null;
  longest_continuous_session_minutes: number;
  tamper_count: number;
  status: string;
  members: MemberState[];
  members_online: number;
  members_total: number;
}

type SortKey =
  | "total_taps"
  | "office_kit_minutes"
  | "camera_opens"
  | "longest_continuous_session_minutes"
  | "team_name";

export default function LiveGrid({
  hackathonId,
  idleWarningTeamIds,
}: {
  hackathonId: string;
  idleWarningTeamIds?: Set<string>;
}) {
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [sortBy, setSortBy] = useState<SortKey>("total_taps");
  const [loading, setLoading] = useState(true);
  const [light, setLight] = useState<"red" | "green">("green");
  const [lightChangedAt, setLightChangedAt] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/hackathon/${hackathonId}/live`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setTeams(data.teams);
        if (data.current_light === "red" || data.current_light === "green") {
          setLight(data.current_light);
        }
        setLightChangedAt(data.light_changed_at ?? null);
      }
    } catch {
      // Silently retry on next interval
    } finally {
      setLoading(false);
    }
  }, [hackathonId]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const sinceLabel = (() => {
    if (!lightChangedAt) return null;
    const t = new Date(lightChangedAt).getTime();
    if (Number.isNaN(t)) return null;
    const sec = Math.max(0, Math.floor((now - t) / 1000));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s}s`;
  })();

  const sorted = [...teams].sort((a, b) => {
    if (sortBy === "team_name") return a.team_name.localeCompare(b.team_name);
    return b[sortBy] - a[sortBy];
  });

  const isRed = light === "red";
  const banner = (
    <div
      className={`mb-8 flex items-center gap-4 rounded-2xl px-6 py-4 text-white shadow-2xl transition-all duration-500 ${
        isRed
          ? "bg-gradient-to-r from-red-600 to-red-900 border-2 border-red-500 animate-pulse"
          : "bg-gradient-to-r from-green-600 to-green-900 border-2 border-green-500"
      }`}
    >
      <div className="relative">
        <span className={`block h-4 w-4 rounded-full bg-white shadow-[0_0_10px_white] ${isRed ? "animate-ping opacity-75" : ""}`} />
        <span className="absolute inset-0 h-4 w-4 rounded-full bg-white" />
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-black uppercase tracking-[0.2em] leading-tight">
          {isRed ? "Restricted Activity" : "Full Access"}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">
          {isRed ? "Venue Red Light Active" : "Venue Green Light Active"}
        </span>
      </div>
      {sinceLabel && (
        <div className="ml-8 pl-8 border-l border-white/20">
          <span className="text-[10px] font-black uppercase tracking-widest opacity-50 block mb-0.5">Duration</span>
          <span className="text-lg font-black tabular-nums">{sinceLabel}</span>
        </div>
      )}
      <div className="ml-auto text-right">
        <span className="text-[10px] font-black uppercase tracking-widest opacity-50 block mb-0.5">Status</span>
        <span className="text-xs font-black uppercase tracking-tighter">Syncing Live</span>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div>
        {banner}
        <div className="flex items-center justify-center py-20 text-gray-500 font-bold">
          Loading...
        </div>
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div>
        {banner}
        <div className="flex items-center justify-center py-20 text-gray-500 font-bold">
          No teams registered yet.
        </div>
      </div>
    );
  }

  return (
    <div>
      {banner}
      <div className="flex items-center gap-3 mb-8 bg-black/5 dark:bg-white/5 p-1.5 rounded-2xl w-fit">
        {(
          [
            ["total_taps", "Taps"],
            ["office_kit_minutes", "Office Kit"],
            ["camera_opens", "Camera"],
            ["longest_continuous_session_minutes", "Resilience"],
            ["team_name", "Name"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSortBy(key)}
            className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all duration-300 ${
              sortBy === key
                ? "bg-primary text-black shadow-lg shadow-primary/20"
                : "text-gray-500 hover:text-black dark:hover:text-primary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {sorted.map((team) => (
          <TeamCard
            key={team.team_id}
            hackathonId={hackathonId}
            team={team}
            idleWarning={idleWarningTeamIds?.has(team.team_id) ?? false}
          />
        ))}
      </div>
    </div>
  );
}
