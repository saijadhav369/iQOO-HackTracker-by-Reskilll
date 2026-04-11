"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "create">("login");

  const [hackathonId, setHackathonId] = useState("");
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [newPasscode, setNewPasscode] = useState("");
  const [createMsg, setCreateMsg] = useState("");

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-passcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hackathon_id: hackathonId, passcode }),
      });
      if (res.ok) {
        router.push(`/dashboard/${hackathonId}`);
      } else {
        const data = await res.json();
        setError(data.error || "Invalid credentials");
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreateMsg("");
    setLoading(true);
    try {
      const res = await fetch("/api/hackathon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: newId, name: newName,
          start_time: new Date(newStart).toISOString(),
          end_time: new Date(newEnd).toISOString(),
          passcode: newPasscode,
        }),
      });
      if (res.ok) {
        setCreateMsg("Created! Logging you in...");
        const loginRes = await fetch("/api/auth/verify-passcode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hackathon_id: newId, passcode: newPasscode }),
        });
        if (loginRes.ok) router.push(`/dashboard/${newId}`);
      } else {
        const data = await res.json();
        setCreateMsg(data.error || "Failed to create");
      }
    } catch {
      setCreateMsg("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const inputClass = "w-full rounded-lg border-2 border-black dark:border-white bg-transparent px-3 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white";

  return (
    <div className="flex min-h-screen items-center justify-center bg-white dark:bg-black px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black uppercase tracking-tight">HackTracker</h1>
          <p className="text-gray-500 mt-2 font-medium">by Reskill</p>
        </div>

        <div className="flex mb-4 border-2 border-black dark:border-white rounded-lg p-1">
          <button
            onClick={() => { setMode("login"); setError(""); setCreateMsg(""); }}
            className={`flex-1 py-2 text-sm font-bold rounded-md transition ${
              mode === "login" ? "bg-black text-white dark:bg-white dark:text-black" : ""
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => { setMode("create"); setError(""); setCreateMsg(""); }}
            className={`flex-1 py-2 text-sm font-bold rounded-md transition ${
              mode === "create" ? "bg-black text-white dark:bg-white dark:text-black" : ""
            }`}
          >
            Create Hackathon
          </button>
        </div>

        {mode === "login" ? (
          <form onSubmit={handleLogin} className="border-2 border-black dark:border-white rounded-xl p-6 space-y-4">
            <div>
              <label htmlFor="hackathon-id" className="block text-xs font-bold uppercase tracking-wider mb-1.5">Hackathon ID</label>
              <input id="hackathon-id" type="text" value={hackathonId} onChange={(e) => setHackathonId(e.target.value)} placeholder="e.g. city_mumbai_2026" required className={inputClass} />
            </div>
            <div>
              <label htmlFor="passcode" className="block text-xs font-bold uppercase tracking-wider mb-1.5">Organiser Passcode</label>
              <input id="passcode" type="password" value={passcode} onChange={(e) => setPasscode(e.target.value)} placeholder="6-digit passcode" required maxLength={10} className={inputClass} />
            </div>
            {error && <p className="text-red-500 text-sm font-bold">{error}</p>}
            <button type="submit" disabled={loading} className="w-full rounded-lg bg-black dark:bg-white text-white dark:text-black py-3 text-sm font-black uppercase tracking-wider hover:opacity-80 transition disabled:opacity-50">
              {loading ? "Verifying..." : "Sign In"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleCreate} className="border-2 border-black dark:border-white rounded-xl p-6 space-y-4">
            <div>
              <label htmlFor="new-id" className="block text-xs font-bold uppercase tracking-wider mb-1.5">Hackathon ID</label>
              <input id="new-id" type="text" value={newId} onChange={(e) => setNewId(e.target.value.toLowerCase().replace(/\s+/g, "_"))} placeholder="e.g. city_mumbai_2026" required className={inputClass} />
              <p className="text-xs text-gray-400 mt-1 font-medium">Lowercase, no spaces. Teams enter this on their phones.</p>
            </div>
            <div>
              <label htmlFor="new-name" className="block text-xs font-bold uppercase tracking-wider mb-1.5">Hackathon Name</label>
              <input id="new-name" type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. iQOO Mumbai Hackathon 2026" required className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="new-start" className="block text-xs font-bold uppercase tracking-wider mb-1.5">Start</label>
                <input id="new-start" type="datetime-local" value={newStart} onChange={(e) => setNewStart(e.target.value)} required className={inputClass} />
              </div>
              <div>
                <label htmlFor="new-end" className="block text-xs font-bold uppercase tracking-wider mb-1.5">End</label>
                <input id="new-end" type="datetime-local" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} required className={inputClass} />
              </div>
            </div>
            <div>
              <label htmlFor="new-passcode" className="block text-xs font-bold uppercase tracking-wider mb-1.5">Organiser Passcode</label>
              <input id="new-passcode" type="password" value={newPasscode} onChange={(e) => setNewPasscode(e.target.value)} placeholder="Set a 6+ digit passcode" required minLength={6} className={inputClass} />
            </div>
            {createMsg && <p className={`text-sm font-bold ${createMsg.includes("Created") ? "text-green-600" : "text-red-500"}`}>{createMsg}</p>}
            <button type="submit" disabled={loading} className="w-full rounded-lg bg-black dark:bg-white text-white dark:text-black py-3 text-sm font-black uppercase tracking-wider hover:opacity-80 transition disabled:opacity-50">
              {loading ? "Creating..." : "Create & Enter Dashboard"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
