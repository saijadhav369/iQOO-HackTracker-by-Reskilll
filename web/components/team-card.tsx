"use client";

import Link from "next/link";

interface TeamCardProps {
  hackathonId: string;
  team: {
    team_id: string;
    team_name: string;
    total_taps: number;
    total_text_inputs: number;
    total_scrolls: number;
    total_app_switches: number;
    current_app: string | null;
    office_kit_minutes: number;
    camera_opens: number;
    battery_level: number | null;
    last_heartbeat: string | null;
    status: string;
  };
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500",
  idle: "bg-yellow-500",
  offline: "bg-red-500",
};

const APP_LABELS: Record<string, string> = {
  "com.vivo.pcsuite": "Office Kit",
  "com.android.chrome": "Chrome",
  "com.android.camera": "Camera",
  "com.google.android.apps.docs": "Files",
  "com.android.settings": "Settings",
  "com.instagram.android": "Instagram",
  "com.whatsapp": "WhatsApp",
  "com.google.android.youtube": "YouTube",
};

function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export default function TeamCard({ hackathonId, team }: TeamCardProps) {
  const appLabel =
    (team.current_app && APP_LABELS[team.current_app]) ||
    team.current_app?.split(".")?.pop() ||
    "—";

  return (
    <Link
      href={`/dashboard/${hackathonId}/team/${team.team_id}`}
      className="block rounded-xl border-2 border-black dark:border-white bg-white dark:bg-black p-5 transition hover:shadow-lg"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-black text-lg uppercase tracking-tight">{team.team_name}</h3>
        <span className="flex items-center gap-1.5 text-xs font-bold uppercase">
          <span
            className={`inline-block h-3 w-3 rounded-full ${STATUS_COLORS[team.status] ?? "bg-gray-400"}`}
          />
          {team.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-gray-500 text-xs uppercase tracking-wider font-bold">Taps</p>
          <p className="text-3xl font-black tabular-nums">
            {team.total_taps.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-gray-500 text-xs uppercase tracking-wider font-bold">Office Kit</p>
          <p className="text-3xl font-black tabular-nums">
            {formatMinutes(team.office_kit_minutes)}
          </p>
        </div>
        <div>
          <p className="text-gray-500 text-xs uppercase tracking-wider font-bold">Camera</p>
          <p className="font-bold text-lg">{team.camera_opens} opens</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs uppercase tracking-wider font-bold">Current App</p>
          <p className="font-bold truncate">{appLabel}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-gray-500 font-medium border-t border-gray-200 dark:border-gray-800 pt-3">
        <span>
          {team.last_heartbeat
            ? `Last updated: ${new Date(team.last_heartbeat).toLocaleTimeString()}`
            : "Never connected"}
        </span>
        {team.battery_level != null && (
          <span className="font-bold">{team.battery_level}%</span>
        )}
      </div>
    </Link>
  );
}
