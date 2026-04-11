"use client";

import { useEffect, useState, useCallback } from "react";
import TeamCard from "./team-card";

interface TeamData {
  team_id: string;
  team_name: string;
  total_taps: number;
  total_text_inputs: number;
  total_scrolls: number;
  total_app_switches: number;
  current_app: string | null;
  office_kit_minutes: number;
  camera_opens: number;
  last_heartbeat: string | null;
  battery_level: number | null;
  status: string;
}

type SortKey = "total_taps" | "office_kit_minutes" | "camera_opens" | "team_name";

export default function LiveGrid({ hackathonId }: { hackathonId: string }) {
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [sortBy, setSortBy] = useState<SortKey>("total_taps");
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/hackathon/${hackathonId}/live`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setTeams(data.teams);
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

  const sorted = [...teams].sort((a, b) => {
    if (sortBy === "team_name") return a.team_name.localeCompare(b.team_name);
    return b[sortBy] - a[sortBy];
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500 font-bold">
        Loading...
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500 font-bold">
        No teams registered yet.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <span className="text-sm text-gray-500 font-bold uppercase tracking-wider">Sort:</span>
        {(
          [
            ["total_taps", "Taps"],
            ["office_kit_minutes", "Office Kit"],
            ["camera_opens", "Camera"],
            ["team_name", "Name"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSortBy(key)}
            className={`px-3 py-1 text-sm font-bold rounded-full border-2 transition ${
              sortBy === key
                ? "bg-black text-white border-black dark:bg-white dark:text-black dark:border-white"
                : "bg-transparent border-gray-300 dark:border-gray-700 hover:border-black dark:hover:border-white"
            }`}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-400 font-medium">
          Live — refreshes every 5s
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {sorted.map((team) => (
          <TeamCard key={team.team_id} hackathonId={hackathonId} team={team} />
        ))}
      </div>
    </div>
  );
}
