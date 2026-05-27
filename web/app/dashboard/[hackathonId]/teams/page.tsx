"use client";

// Canonical Teams page — one row per team, each expanded to show its members
// (slot, participant name, device id, live status, last seen, battery). This
// is the authoritative team→device→participant map; both organisers and
// support staff use it to figure out which phone is whose at a glance.

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";

interface Member {
  slot: number;
  memberName: string;
  deviceId: string;
  online: boolean;
  lastHeartbeat: string | null;
  batteryLevel: number | null;
}

interface Team {
  id: string;
  name: string;
  status: "active" | "idle" | "offline";
  lastHeartbeat: string | null;
  batteryLevel: number | null;
  members: Member[];
}

const POLL_MS = 15_000;

const STATUS_COLOR: Record<string, string> = {
  active: "bg-green-500",
  idle: "bg-yellow-500",
  offline: "bg-gray-400",
};

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function truncateDevice(id: string): string {
  if (id.length <= 16) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

export default function TeamsPage() {
  const params = useParams();
  const hackathonId = params.hackathonId as string;
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(
          `/api/hackathon/${encodeURIComponent(hackathonId)}/teams`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as Team[];
        if (!cancelled) {
          setTeams(data);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [hackathonId]);

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#050505]">
      <header className="sticky top-0 z-40 border-b border-black/5 dark:border-primary/20 bg-white/80 dark:bg-black/80 backdrop-blur-md px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/HackTracker.png"
              alt="Logo"
              width={40}
              height={40}
              className="rounded-lg shadow-lg shadow-primary/10"
            />
            <div>
              <h1 className="text-xl font-black uppercase tracking-tighter leading-none">
                Teams
              </h1>
              <p className="text-[10px] text-primary font-black uppercase tracking-widest mt-1 opacity-80">
                {hackathonId}
              </p>
            </div>
          </div>
          <a
            href={`/dashboard/${hackathonId}`}
            className="px-4 py-2 text-xs font-black uppercase tracking-widest rounded-lg border border-black/10 dark:border-white/10 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition active:scale-95"
          >
            ← Dashboard
          </a>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {loading && teams.length === 0 ? (
          <p className="text-sm opacity-60">Loading…</p>
        ) : error ? (
          <p className="text-sm text-red-500">Failed to load: {error}</p>
        ) : teams.length === 0 ? (
          <p className="text-sm opacity-60">
            No teams registered yet. Create one on the{" "}
            <a
              href={`/dashboard/${hackathonId}/manage`}
              className="text-primary hover:underline"
            >
              Manage
            </a>{" "}
            page first.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {teams.map((team) => (
              <div
                key={team.id}
                className="rounded-2xl border border-black/10 dark:border-white/10 overflow-hidden bg-white dark:bg-[#0a0a0a]"
              >
                <div className="px-6 py-4 flex items-center justify-between border-b border-black/5 dark:border-white/5">
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-block h-2.5 w-2.5 rounded-full ${
                        STATUS_COLOR[team.status] ?? "bg-gray-400"
                      }`}
                      title={team.status}
                    />
                    <a
                      href={`/dashboard/${hackathonId}/team/${team.id}`}
                      className="font-black text-lg uppercase tracking-tighter hover:text-primary transition"
                    >
                      {team.name}
                    </a>
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-50 font-mono">
                      {team.id}
                    </span>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-60">
                    {team.members.length}{" "}
                    {team.members.length === 1 ? "member" : "members"}
                  </span>
                </div>
                {team.members.length === 0 ? (
                  <div className="px-6 py-5 text-xs opacity-50">
                    No devices registered for this team yet.
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-black/5 dark:bg-white/5">
                      <tr className="text-left">
                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest w-16">
                          Slot
                        </th>
                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest">
                          Participant
                        </th>
                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest">
                          Device ID
                        </th>
                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest w-24">
                          Status
                        </th>
                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest w-24">
                          Battery
                        </th>
                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest">
                          Last seen
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {team.members.map((m) => (
                        <tr
                          key={`${m.slot}|${m.deviceId}`}
                          className="border-t border-black/5 dark:border-white/5"
                        >
                          <td className="px-4 py-3 font-mono text-xs">
                            M{m.slot}
                          </td>
                          <td className="px-4 py-3 font-black uppercase tracking-tight">
                            {m.memberName}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs opacity-70" title={m.deviceId}>
                            {truncateDevice(m.deviceId)}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            <span
                              className={`inline-flex items-center gap-2 ${
                                m.online ? "text-green-500" : "opacity-50"
                              }`}
                            >
                              <span
                                className={`inline-block h-1.5 w-1.5 rounded-full ${
                                  m.online ? "bg-green-500" : "bg-gray-400"
                                }`}
                              />
                              {m.online ? "Online" : "Offline"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs tabular-nums opacity-70">
                            {m.batteryLevel != null ? `${m.batteryLevel}%` : "—"}
                          </td>
                          <td className="px-4 py-3 text-xs opacity-70">
                            {formatTime(m.lastHeartbeat)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
