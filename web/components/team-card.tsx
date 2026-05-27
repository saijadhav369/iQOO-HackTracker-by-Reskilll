"use client";

import { useState } from "react";
import Link from "next/link";

interface MemberState {
  slot: number;
  member_name: string;
  device_id: string;
  online: boolean;
  last_heartbeat: string | null;
  battery_level: number | null;
}

interface TeamCardProps {
  hackathonId: string;
  team: {
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
    battery_level: number | null;
    last_heartbeat: string | null;
    longest_continuous_session_minutes: number;
    tamper_count: number;
    status: string;
    members?: MemberState[];
    members_online?: number;
    members_total?: number;
  };
  idleWarning?: boolean;
}

function formatKeyboardTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500",
  idle: "bg-yellow-500",
  offline: "bg-gray-400",
  crashed: "bg-red-500",
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

export default function TeamCard({ hackathonId, team, idleWarning }: TeamCardProps) {
  const [membersOpen, setMembersOpen] = useState(false);
  const appLabel =
    (team.current_app && APP_LABELS[team.current_app]) ||
    team.current_app?.split(".")?.pop() ||
    "—";

  const tampered = team.tamper_count > 0;
  const borderClass = tampered
    ? "border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.2)] animate-pulse"
    : idleWarning
    ? "border-primary shadow-[0_0_15px_rgba(251,178,1,0.2)] animate-pulse"
    : "border-black/5 dark:border-white/5 hover:border-primary/50";

  const memberCount = team.members_total ?? team.members?.length ?? 0;
  const onlineCount = team.members_online ?? 0;

  return (
    <div className="relative group">
      {tampered && (
        <Link
          href={`/dashboard/${hackathonId}/team/${team.team_id}?tab=tamper`}
          title={`${team.tamper_count} unresolved tamper event${team.tamper_count === 1 ? "" : "s"}`}
          className="absolute -top-2 -right-2 z-10 flex items-center justify-center h-8 w-8 rounded-full bg-red-600 text-white shadow-xl hover:bg-red-700 transition-transform hover:scale-110 active:scale-90"
        >
          <span aria-hidden className="text-sm font-black">!</span>
        </Link>
      )}
    <Link
      href={`/dashboard/${hackathonId}/team/${team.team_id}`}
      className={`block rounded-2xl border-2 ${borderClass} bg-white dark:bg-black/40 backdrop-blur-sm p-6 transition-all duration-300 hover:shadow-2xl hover:-translate-y-1`}
    >
      <div className="flex items-center justify-between mb-6 gap-2">
        <h3 className="font-black text-xl uppercase tracking-tighter leading-tight">{team.team_name}</h3>
        <div className="flex items-center gap-2 shrink-0">
          {memberCount > 0 && (
            <span
              className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-widest ${
                onlineCount === memberCount
                  ? "bg-green-500/10 text-green-500"
                  : onlineCount > 0
                  ? "bg-primary/10 text-primary"
                  : "bg-gray-500/10 text-gray-500"
              }`}
              title={`${onlineCount} of ${memberCount} members online`}
            >
              {onlineCount}/{memberCount} ONLINE
            </span>
          )}
          <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-widest ${
            team.status === 'active' ? 'bg-green-500/10 text-green-500' :
            team.status === 'idle' ? 'bg-primary/10 text-primary' :
            'bg-gray-500/10 text-gray-500'
          }`}>
            {team.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-y-6 gap-x-4 mb-6">
        <div>
          <p className="text-gray-400 text-[10px] uppercase tracking-widest font-black mb-1">Total Taps</p>
          <p className="text-2xl font-black tabular-nums tracking-tighter">
            {team.total_taps.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-gray-400 text-[10px] uppercase tracking-widest font-black mb-1">Office Kit</p>
          <p className="text-2xl font-black tabular-nums tracking-tighter text-primary">
            {formatMinutes(team.office_kit_minutes)}
          </p>
        </div>
        <div>
          <p className="text-gray-400 text-[10px] uppercase tracking-widest font-black mb-1">Camera</p>
          <p className="font-black text-base">{team.camera_opens} <span className="text-[10px] opacity-50">OPENS</span></p>
        </div>
        <div>
          <p className="text-gray-400 text-[10px] uppercase tracking-widest font-black mb-1">Active App</p>
          <p className="font-black text-sm truncate uppercase tracking-tight">{appLabel}</p>
        </div>
      </div>

      <div className="space-y-2 mb-6">
        <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest opacity-60">
          <span>Keyboard</span>
          <span className="text-foreground">{formatKeyboardTime(team.total_keyboard_seconds)}</span>
        </div>
        <div className="w-full bg-black/5 dark:bg-white/5 h-1 rounded-full overflow-hidden">
          <div
            className="bg-primary h-full transition-all duration-1000"
            style={{ width: `${Math.min(100, (team.total_keyboard_seconds / 3600) * 100)}%` }}
          />
        </div>
      </div>

      {team.members && team.members.length > 0 && (
        <div className="border-t border-black/5 dark:border-white/5 pt-3 mb-3">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMembersOpen((v) => !v);
            }}
            className="w-full flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-primary transition-colors"
          >
            <span>Members</span>
            <span className={`transition-transform ${membersOpen ? "rotate-180" : ""}`}>▾</span>
          </button>
          {membersOpen && (
            <ul className="mt-2 space-y-1">
              {team.members.map((m) => (
                <li
                  key={m.device_id}
                  className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest"
                >
                  <span className="flex items-center gap-2 truncate">
                    <span
                      className={`inline-block h-1.5 w-1.5 rounded-full ${
                        m.online ? "bg-green-500" : "bg-gray-400"
                      }`}
                    />
                    <span className="truncate">M{m.slot}: {m.member_name}</span>
                  </span>
                  {m.battery_level != null && (
                    <span className="opacity-60 tabular-nums">{m.battery_level}%</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest border-t border-black/5 dark:border-white/5 pt-4 opacity-50">
        <span className="flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {team.last_heartbeat ? new Date(team.last_heartbeat).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "OFFLINE"}
        </span>
        {team.battery_level != null && (
          <span className="flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            {team.battery_level}%
          </span>
        )}
      </div>
    </Link>
    </div>
  );
}
