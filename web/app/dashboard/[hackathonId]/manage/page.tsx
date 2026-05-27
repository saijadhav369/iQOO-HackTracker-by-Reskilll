"use client";

import { useState, useEffect, useCallback, FormEvent } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface MemberRow {
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
  deviceId: string | null;
  status: string;
  lastHeartbeat: string | null;
  batteryLevel: number | null;
  members: MemberRow[];
}

import Image from "next/image";

// Big tabular-nums digit cell for the elapsed-time counter. Three of these
// (hours / minutes / seconds) sit side by side with `:` separators.
function TimeUnit({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center min-w-[4rem]">
      <span className="text-5xl font-black tabular-nums tracking-tighter leading-none">
        {value}
      </span>
      <span className="mt-2 text-[10px] font-black uppercase tracking-widest opacity-50">
        {label}
      </span>
    </div>
  );
}

export default function ManagePage() {
  const params = useParams();
  const hackathonId = params.hackathonId as string;

  const [teams, setTeams] = useState<Team[]>([]);
  const [newTeamId, setNewTeamId] = useState("");
  const [newTeamName, setNewTeamName] = useState("");
  // Device ID input removed — per-phone identity is now claimed when the phone
  // registers from the Android app (team_members table keyed by device_id).
  // Manage page only creates the team row; phones add themselves via dropdown.
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  // Hackathon meta drives the elapsed-time counter. Status is one of
  // upcoming | active | ended; start_time + end_time are server-stamped
  // when the organiser presses Start / End, so the counter is durable
  // across browser refreshes.
  const [hackathonMeta, setHackathonMeta] = useState<{
    status: string;
    start_time: string | null;
    end_time: string | null;
  } | null>(null);
  const [nowMs, setNowMs] = useState<number>(Date.now());

  // Notification state
  const [notifTitle, setNotifTitle] = useState("");
  const [notifMessage, setNotifMessage] = useState("");
  const [notifFilter, setNotifFilter] = useState("all");
  const [notifMaxTaps, setNotifMaxTaps] = useState("");
  const [notifMinTaps, setNotifMinTaps] = useState("");
  const [notifMsg, setNotifMsg] = useState("");
  const [sentNotifs, setSentNotifs] = useState<Array<{ id: number; title: string; message: string; targetFilter: string; createdAt: string }>>([]);

  async function fetchTeams() {
    const res = await fetch(`/api/hackathon/${hackathonId}/teams`);
    if (res.ok) {
      setTeams(await res.json());
    }
  }

  async function fetchNotifs() {
    const res = await fetch(`/api/hackathon/${hackathonId}/notify`);
    if (res.ok) setSentNotifs(await res.json());
  }

  // /live includes hackathon meta (status + start/end time). One source of
  // truth — same data the main dashboard polls for the live grid.
  const fetchHackathonMeta = useCallback(async () => {
    const res = await fetch(`/api/hackathon/${hackathonId}/live`, {
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.hackathon) {
        setHackathonMeta({
          status: data.hackathon.status,
          start_time: data.hackathon.start_time ?? null,
          end_time: data.hackathon.end_time ?? null,
        });
      }
    }
  }, [hackathonId]);

  useEffect(() => {
    fetchTeams();
    fetchNotifs();
    fetchHackathonMeta();
  }, [hackathonId, fetchHackathonMeta]);

  // 1Hz local ticker — when the hackathon is "active" we recompute elapsed
  // every second so the counter shows live h/m/s. Stops while ended/upcoming
  // because the value is frozen (or zero).
  useEffect(() => {
    if (hackathonMeta?.status !== "active") return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [hackathonMeta?.status]);

  async function handleAddTeam(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: newTeamId,
          hackathon_id: hackathonId,
          name: newTeamName,
          // device_id intentionally omitted — phones claim slots themselves.
        }),
      });

      if (res.ok) {
        setMessage("Team added!");
        setNewTeamId("");
        setNewTeamName("");
        // (no device_id state to reset)
        fetchTeams();
      } else {
        const data = await res.json();
        setMessage(data.error || "Failed to add team");
      }
    } catch {
      setMessage("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(action: "start" | "end") {
    const confirmed = confirm(
      `Are you sure you want to ${action} this hackathon?`
    );
    if (!confirmed) return;

    const res = await fetch(`/api/hackathon/${hackathonId}/${action}`, {
      method: "POST",
    });

    if (res.ok) {
      const data = await res.json();
      setMessage(
        action === "end"
          ? `Hackathon ended. ${data.reports_generated} reports generated.`
          : "Hackathon started!"
      );
      // Refresh meta so the counter starts/stops immediately without waiting
      // for the next poll cycle.
      fetchHackathonMeta();
    } else {
      setMessage("Action failed");
    }
  }

  // Elapsed time the timer should display. Active = now - start_time, ended
  // = end_time - start_time (frozen), upcoming = 0.
  function computeElapsedSec(): number {
    if (!hackathonMeta?.start_time) return 0;
    const startMs = new Date(hackathonMeta.start_time).getTime();
    if (isNaN(startMs)) return 0;
    const endMs =
      hackathonMeta.status === "ended" && hackathonMeta.end_time
        ? new Date(hackathonMeta.end_time).getTime()
        : nowMs;
    return Math.max(0, Math.floor((endMs - startMs) / 1000));
  }

  function formatHMS(totalSec: number): { h: string; m: string; s: string } {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n: number) => n.toString().padStart(2, "0");
    return { h: pad(h), m: pad(m), s: pad(s) };
  }

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#050505]">
      <header className="sticky top-0 z-40 border-b border-black/5 dark:border-primary/20 bg-white/80 dark:bg-black/80 backdrop-blur-md px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href={`/dashboard/${hackathonId}`}
              className="flex items-center justify-center h-10 w-10 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-primary hover:text-black transition-all group"
            >
              <span className="group-hover:-translate-x-0.5 transition-transform font-black">&larr;</span>
            </Link>
            <div className="flex items-center gap-3">
              <Image
                src="/HackTracker.png"
                alt="Logo"
                width={40}
                height={40}
                className="rounded-lg"
              />
              <div>
                <h1 className="text-xl font-black uppercase tracking-tighter leading-none">Management</h1>
                <p className="text-[10px] text-primary font-black uppercase tracking-widest mt-1 opacity-80">{hackathonId}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Hackathon Controls */}
        <section className="bg-white dark:bg-white/5 rounded-3xl border border-black/5 dark:border-white/5 p-8 shadow-xl">
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-400 mb-6">Execution Controls</h2>
          <div className="flex gap-4">
            <button
              onClick={() => handleAction("start")}
              disabled={hackathonMeta?.status === "active" || hackathonMeta?.status === "ended"}
              className="flex-1 px-6 py-4 rounded-2xl bg-green-500 text-black text-xs font-black uppercase tracking-widest hover:brightness-110 transition shadow-lg shadow-green-500/10 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Start Hackathon
            </button>
            <button
              onClick={() => handleAction("end")}
              disabled={hackathonMeta?.status !== "active"}
              className="flex-1 px-6 py-4 rounded-2xl bg-red-500 text-black text-xs font-black uppercase tracking-widest hover:brightness-110 transition shadow-lg shadow-red-500/10 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              End Hackathon
            </button>
          </div>

          {/* Elapsed-time counter. Active = ticking 1Hz; ended = frozen at the
              final duration; upcoming = hidden helper text. */}
          {hackathonMeta && (
            <div className="mt-6 rounded-2xl border border-black/5 dark:border-white/5 bg-black/5 dark:bg-white/5 p-6">
              <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">
                  Elapsed
                </span>
                <span
                  className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                    hackathonMeta.status === "active"
                      ? "bg-green-500/15 text-green-500"
                      : hackathonMeta.status === "ended"
                        ? "bg-gray-500/15 text-gray-500"
                        : "bg-primary/15 text-primary"
                  }`}
                >
                  {hackathonMeta.status === "active" && (
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500 mr-1.5 animate-pulse" />
                  )}
                  {hackathonMeta.status.toUpperCase()}
                </span>
              </div>
              {hackathonMeta.status === "upcoming" ? (
                <p className="text-sm font-bold text-gray-500">
                  Not started yet. Click <span className="text-green-500">Start Hackathon</span> when ready.
                </p>
              ) : (
                <div className="flex items-end justify-center gap-2 tabular-nums">
                  {(() => {
                    const { h, m, s } = formatHMS(computeElapsedSec());
                    return (
                      <>
                        <TimeUnit value={h} label="HOURS" />
                        <span className="text-4xl font-black opacity-30 pb-2">:</span>
                        <TimeUnit value={m} label="MINUTES" />
                        <span className="text-4xl font-black opacity-30 pb-2">:</span>
                        <TimeUnit value={s} label="SECONDS" />
                      </>
                    );
                  })()}
                </div>
              )}
              {hackathonMeta.status === "active" && hackathonMeta.start_time && (
                <p className="mt-4 text-center text-[10px] font-black uppercase tracking-widest opacity-50">
                  Started {new Date(hackathonMeta.start_time).toLocaleString()}
                </p>
              )}
              {hackathonMeta.status === "ended" && hackathonMeta.end_time && (
                <p className="mt-4 text-center text-[10px] font-black uppercase tracking-widest opacity-50">
                  Ended {new Date(hackathonMeta.end_time).toLocaleString()}
                </p>
              )}
            </div>
          )}

          {message && (
            <p className="mt-6 text-[10px] font-black uppercase tracking-widest text-primary text-center">
              {message}
            </p>
          )}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {/* Add Team */}
          <section className="bg-white dark:bg-white/5 rounded-3xl border border-black/5 dark:border-white/5 p-8 shadow-xl">
            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-400 mb-6">Register Team</h2>
            <form onSubmit={handleAddTeam} className="space-y-4">
              <div className="space-y-3">
                <input
                  type="text"
                  value={newTeamId}
                  onChange={(e) => setNewTeamId(e.target.value)}
                  placeholder="Team ID (e.g. team_01)"
                  required
                  className="w-full rounded-xl border border-black/5 dark:border-white/5 bg-black/5 dark:bg-white/5 px-4 py-3 text-sm font-black focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                />
                <input
                  type="text"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="Team Name"
                  required
                  className="w-full rounded-xl border border-black/5 dark:border-white/5 bg-black/5 dark:bg-white/5 px-4 py-3 text-sm font-black focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest opacity-50">
                Phones claim their member slot via the team dropdown in the Android Setup screen.
              </p>
              <button
                type="submit"
                disabled={loading}
                className="w-full px-6 py-4 rounded-2xl bg-primary text-black text-xs font-black uppercase tracking-widest hover:brightness-110 transition shadow-lg shadow-primary/10 disabled:opacity-50 active:scale-[0.98]"
              >
                {loading ? "Registering..." : "Add Team"}
              </button>
            </form>
          </section>

          {/* Push Notifications */}
          <section className="bg-white dark:bg-white/5 rounded-3xl border border-black/5 dark:border-white/5 p-8 shadow-xl">
            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-400 mb-6">Broadcast Notification</h2>
            <form
              onSubmit={async (e: FormEvent) => {
                e.preventDefault();
                setNotifMsg("");
                const body: Record<string, unknown> = {
                  title: notifTitle,
                  message: notifMessage,
                  target_filter: notifFilter,
                };
                if (notifFilter === "low_taps" && notifMaxTaps) body.target_max_taps = parseInt(notifMaxTaps);
                if (notifFilter === "high_taps" && notifMinTaps) body.target_min_taps = parseInt(notifMinTaps);

                const res = await fetch(`/api/hackathon/${hackathonId}/notify`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(body),
                });
                if (res.ok) {
                  setNotifMsg("Notification sent!");
                  setNotifTitle("");
                  setNotifMessage("");
                  fetchNotifs();
                } else {
                  const data = await res.json();
                  setNotifMsg(data.error || "Failed");
                }
              }}
              className="space-y-4"
            >
              <input
                type="text"
                value={notifTitle}
                onChange={(e) => setNotifTitle(e.target.value)}
                placeholder="Title"
                required
                className="w-full rounded-xl border border-black/5 dark:border-white/5 bg-black/5 dark:bg-white/5 px-4 py-3 text-sm font-black focus:outline-none focus:ring-2 focus:ring-primary transition-all"
              />
              <textarea
                value={notifMessage}
                onChange={(e) => setNotifMessage(e.target.value)}
                placeholder="Message body"
                required
                rows={2}
                className="w-full rounded-xl border border-black/5 dark:border-white/5 bg-black/5 dark:bg-white/5 px-4 py-3 text-sm font-black focus:outline-none focus:ring-2 focus:ring-primary transition-all"
              />
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Target Audience</label>
                  <select
                    value={notifFilter}
                    onChange={(e) => setNotifFilter(e.target.value)}
                    className="w-full rounded-xl border border-black/5 dark:border-white/5 bg-black/5 dark:bg-white/5 px-4 py-3 text-sm font-black focus:outline-none focus:ring-2 focus:ring-primary transition-all appearance-none cursor-pointer"
                  >
                    <option value="all">All Devices</option>
                    <option value="active">Active Only</option>
                    <option value="idle">Idle Only</option>
                    <option value="low_taps">Low Taps</option>
                    <option value="high_taps">High Taps</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                {notifFilter === "low_taps" && (
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Max Taps</label>
                    <input
                      type="number"
                      value={notifMaxTaps}
                      onChange={(e) => setNotifMaxTaps(e.target.value)}
                      placeholder="e.g. 50"
                      className="w-full rounded-xl border border-black/5 dark:border-white/5 bg-black/5 dark:bg-white/5 px-4 py-3 text-sm font-black focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                    />
                  </div>
                )}
                {notifFilter === "high_taps" && (
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Min Taps</label>
                    <input
                      type="number"
                      value={notifMinTaps}
                      onChange={(e) => setNotifMinTaps(e.target.value)}
                      placeholder="e.g. 500"
                      className="w-full rounded-xl border border-black/5 dark:border-white/5 bg-black/5 dark:bg-white/5 px-4 py-3 text-sm font-black focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                    />
                  </div>
                )}
                </div>
                <button
                  type="submit"
                  className="w-full px-6 py-4 rounded-2xl bg-black text-white dark:bg-white dark:text-black text-xs font-black uppercase tracking-widest hover:brightness-110 transition shadow-lg shadow-black/10 active:scale-[0.98]"
                >
                  Blast Notification
                </button>
              </div>
              {notifMsg && (
                <p className={`text-[10px] font-black uppercase tracking-widest text-center ${notifMsg.includes("sent") ? "text-green-500" : "text-red-500"}`}>
                  {notifMsg}
                </p>
              )}
            </form>
          </section>
        </div>

        {/* Teams List */}
        <section className="bg-white dark:bg-white/5 rounded-3xl border border-black/5 dark:border-white/5 p-8 shadow-xl">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">Registered Teams ({teams.length})</h2>
            <span className="h-px flex-1 bg-black/5 dark:bg-white/5 ml-6"></span>
          </div>
          {teams.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-gray-400 font-black uppercase tracking-widest text-xs opacity-50">No teams registered yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-black uppercase tracking-widest text-gray-400 opacity-70">
                    <th className="pb-6">Team Details</th>
                    <th className="pb-6">Members</th>
                    <th className="pb-6">Status</th>
                    <th className="pb-6">Last Active</th>
                    <th className="pb-6 text-right">Battery</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {teams.map((team) => (
                    <tr
                      key={team.id}
                      className="group border-t border-black/5 dark:border-white/5 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                    >
                      <td className="py-5 pr-4">
                        <div className="font-black uppercase tracking-tight">{team.name}</div>
                        <div className="text-[10px] text-primary font-black uppercase tracking-widest opacity-50">{team.id}</div>
                      </td>
                      <td className="py-5 pr-4">
                        {team.members.length === 0 ? (
                          <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 opacity-50">
                            No phones registered
                          </span>
                        ) : (
                          <ul className="space-y-1">
                            {team.members.map((m) => (
                              <li
                                key={m.deviceId}
                                className="flex items-center gap-2 text-[11px] font-black uppercase tracking-tight"
                              >
                                <span
                                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                                    m.online ? "bg-green-500" : "bg-gray-400"
                                  }`}
                                />
                                <span>M{m.slot}: {m.memberName}</span>
                                {m.batteryLevel != null && (
                                  <span className="opacity-60 tabular-nums">{m.batteryLevel}%</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="py-5 pr-4">
                        <div
                          className={`inline-flex items-center gap-2 px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-widest ${
                            team.status === "active"
                              ? "bg-green-500/10 text-green-500"
                              : team.status === "idle"
                                ? "bg-primary/10 text-primary"
                                : "bg-red-500/10 text-red-500"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              team.status === "active"
                                ? "bg-green-500"
                                : team.status === "idle"
                                  ? "bg-primary"
                                  : "bg-red-500 shadow-[0_0_8px_red]"
                            }`}
                          />
                          {team.status}
                        </div>
                      </td>
                      <td className="py-5 pr-4 text-[10px] font-black uppercase tracking-widest opacity-50 tabular-nums">
                        {team.lastHeartbeat
                          ? new Date(team.lastHeartbeat).toLocaleTimeString()
                          : "NEVER"}
                      </td>
                      <td className="py-5 text-right font-black tabular-nums">
                        {team.batteryLevel != null
                          ? `${team.batteryLevel}%`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
