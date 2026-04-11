"use client";

import { useState, useEffect, FormEvent } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface Team {
  id: string;
  name: string;
  deviceId: string | null;
  status: string;
  lastHeartbeat: string | null;
  batteryLevel: number | null;
}

export default function ManagePage() {
  const params = useParams();
  const hackathonId = params.hackathonId as string;

  const [teams, setTeams] = useState<Team[]>([]);
  const [newTeamId, setNewTeamId] = useState("");
  const [newTeamName, setNewTeamName] = useState("");
  const [newDeviceId, setNewDeviceId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

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

  useEffect(() => {
    fetchTeams();
    fetchNotifs();
  }, [hackathonId]);

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
          device_id: newDeviceId || undefined,
        }),
      });

      if (res.ok) {
        setMessage("Team added!");
        setNewTeamId("");
        setNewTeamName("");
        setNewDeviceId("");
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
    } else {
      setMessage("Action failed");
    }
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <header className="border-b-2 border-black dark:border-white px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <Link href={`/dashboard/${hackathonId}`} className="text-gray-500 hover:text-black dark:hover:text-white transition font-bold">
            &larr; Dashboard
          </Link>
          <h1 className="text-2xl font-black uppercase tracking-tight">Manage: {hackathonId}</h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Hackathon Controls */}
        <section className="rounded-xl border-2 border-black dark:border-white p-6">
          <h2 className="text-lg font-black uppercase tracking-tight mb-4">Hackathon Controls</h2>
          <div className="flex gap-3">
            <button
              onClick={() => handleAction("start")}
              className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-black uppercase hover:bg-green-700 transition"
            >
              Start Hackathon
            </button>
            <button
              onClick={() => handleAction("end")}
              className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-black uppercase hover:bg-red-700 transition"
            >
              End Hackathon
            </button>
          </div>
          {message && (
            <p className="mt-3 text-sm font-bold text-gray-600 dark:text-gray-400">
              {message}
            </p>
          )}
        </section>

        {/* Add Team */}
        <section className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
          <h2 className="text-lg font-semibold mb-4">Add Team</h2>
          <form onSubmit={handleAddTeam} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                value={newTeamId}
                onChange={(e) => setNewTeamId(e.target.value)}
                placeholder="Team ID (e.g. team_01)"
                required
                className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm"
              />
              <input
                type="text"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="Team Name"
                required
                className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm"
              />
              <input
                type="text"
                value={newDeviceId}
                onChange={(e) => setNewDeviceId(e.target.value)}
                placeholder="Device ID (optional)"
                className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
            >
              {loading ? "Adding..." : "Add Team"}
            </button>
          </form>
        </section>

        {/* Push Notifications */}
        <section className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
          <h2 className="text-lg font-semibold mb-4">Push Notifications</h2>
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
            className="space-y-3"
          >
            <input
              type="text"
              value={notifTitle}
              onChange={(e) => setNotifTitle(e.target.value)}
              placeholder="Notification title"
              required
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm"
            />
            <textarea
              value={notifMessage}
              onChange={(e) => setNotifMessage(e.target.value)}
              placeholder="Message body"
              required
              rows={2}
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Target audience</label>
                <select
                  value={notifFilter}
                  onChange={(e) => setNotifFilter(e.target.value)}
                  className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm"
                >
                  <option value="all">All devices</option>
                  <option value="active">Active only</option>
                  <option value="idle">Idle only</option>
                  <option value="low_taps">Low taps (below threshold)</option>
                  <option value="high_taps">High taps (above threshold)</option>
                </select>
              </div>
              {notifFilter === "low_taps" && (
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Max taps threshold</label>
                  <input
                    type="number"
                    value={notifMaxTaps}
                    onChange={(e) => setNotifMaxTaps(e.target.value)}
                    placeholder="e.g. 50"
                    className="w-28 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm"
                  />
                </div>
              )}
              {notifFilter === "high_taps" && (
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Min taps threshold</label>
                  <input
                    type="number"
                    value={notifMinTaps}
                    onChange={(e) => setNotifMinTaps(e.target.value)}
                    placeholder="e.g. 500"
                    className="w-28 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm"
                  />
                </div>
              )}
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition"
              >
                Send Notification
              </button>
            </div>
            {notifMsg && (
              <p className={`text-sm ${notifMsg.includes("sent") ? "text-green-600" : "text-red-500"}`}>
                {notifMsg}
              </p>
            )}
          </form>

          {sentNotifs.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-medium text-zinc-500 mb-2">Sent notifications</h3>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {sentNotifs.map((n) => (
                  <div key={n.id} className="flex items-start gap-3 text-sm border-b border-zinc-100 dark:border-zinc-800/50 pb-2">
                    <div className="flex-1">
                      <p className="font-medium">{n.title}</p>
                      <p className="text-zinc-500">{n.message}</p>
                    </div>
                    <div className="text-xs text-zinc-400 whitespace-nowrap">
                      <span className="bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded">{n.targetFilter}</span>
                      <br />
                      {new Date(n.createdAt).toLocaleTimeString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Teams List */}
        <section className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
          <h2 className="text-lg font-semibold mb-4">
            Teams ({teams.length})
          </h2>
          {teams.length === 0 ? (
            <p className="text-zinc-500 text-sm">No teams registered yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 text-left">
                    <th className="pb-2 font-medium">ID</th>
                    <th className="pb-2 font-medium">Name</th>
                    <th className="pb-2 font-medium">Device</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium">Last Seen</th>
                    <th className="pb-2 font-medium">Battery</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((team) => (
                    <tr
                      key={team.id}
                      className="border-b border-zinc-100 dark:border-zinc-800/50"
                    >
                      <td className="py-2 font-mono text-xs">{team.id}</td>
                      <td className="py-2">{team.name}</td>
                      <td className="py-2 font-mono text-xs">
                        {team.deviceId || "—"}
                      </td>
                      <td className="py-2">
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs ${
                            team.status === "active"
                              ? "text-green-600"
                              : team.status === "idle"
                                ? "text-yellow-600"
                                : "text-red-500"
                          }`}
                        >
                          <span
                            className={`h-2 w-2 rounded-full ${
                              team.status === "active"
                                ? "bg-green-500"
                                : team.status === "idle"
                                  ? "bg-yellow-500"
                                  : "bg-red-500"
                            }`}
                          />
                          {team.status}
                        </span>
                      </td>
                      <td className="py-2 text-xs text-zinc-500">
                        {team.lastHeartbeat
                          ? new Date(team.lastHeartbeat).toLocaleTimeString()
                          : "—"}
                      </td>
                      <td className="py-2 text-xs">
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
