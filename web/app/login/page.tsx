"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

import Image from "next/image";

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

  const inputClass = "w-full rounded-xl border-2 border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all placeholder:text-gray-400";

  return (
    <div className="flex min-h-screen items-center justify-center bg-white dark:bg-black px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10 flex flex-col items-center">
          <Image
            src="/HackTracker.png"
            alt="HackTracker Logo"
            width={180}
            height={180}
            className="rounded-2xl shadow-2xl shadow-primary/10 transition-transform hover:scale-105 duration-500"
          />
        </div>

        <div className="flex mb-6 border-2 border-black dark:border-primary rounded-xl p-1 bg-black/5 dark:bg-primary/5">
          <button
            onClick={() => { setMode("login"); setError(""); setCreateMsg(""); }}
            className={`flex-1 py-3 text-sm font-black uppercase tracking-wider rounded-lg transition-all duration-200 ${
              mode === "login"
                ? "bg-primary text-black shadow-lg"
                : "text-gray-500 hover:text-black dark:hover:text-primary"
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => { setMode("create"); setError(""); setCreateMsg(""); }}
            className={`flex-1 py-3 text-sm font-black uppercase tracking-wider rounded-lg transition-all duration-200 ${
              mode === "create"
                ? "bg-primary text-black shadow-lg"
                : "text-gray-500 hover:text-black dark:hover:text-primary"
            }`}
          >
            Create
          </button>
        </div>

        {mode === "login" ? (
          <form onSubmit={handleLogin} className="border-2 border-black dark:border-primary/30 rounded-2xl p-8 space-y-6 bg-white dark:bg-black/40 backdrop-blur-sm shadow-xl">
            <div>
              <label htmlFor="hackathon-id" className="block text-xs font-black uppercase tracking-widest mb-2 opacity-70">Hackathon ID</label>
              <input id="hackathon-id" type="text" value={hackathonId} onChange={(e) => setHackathonId(e.target.value)} placeholder="e.g. city_mumbai_2026" required className={inputClass} />
            </div>
            <div>
              <label htmlFor="passcode" className="block text-xs font-black uppercase tracking-widest mb-2 opacity-70">Organiser Passcode</label>
              <input id="passcode" type="password" value={passcode} onChange={(e) => setPasscode(e.target.value)} placeholder="6-digit passcode" required maxLength={10} className={inputClass} />
            </div>
            {error && <p className="text-red-500 text-sm font-bold bg-red-500/10 p-3 rounded-lg border border-red-500/20">{error}</p>}
            <button type="submit" disabled={loading} className="w-full rounded-xl bg-primary text-black py-4 text-sm font-black uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg shadow-primary/20">
              {loading ? "Verifying..." : "Enter Dashboard"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleCreate} className="border-2 border-black dark:border-primary/30 rounded-2xl p-8 space-y-5 bg-white dark:bg-black/40 backdrop-blur-sm shadow-xl">
            <div>
              <label htmlFor="new-id" className="block text-xs font-black uppercase tracking-widest mb-2 opacity-70">Hackathon ID</label>
              <input id="new-id" type="text" value={newId} onChange={(e) => setNewId(e.target.value.toLowerCase().replace(/\s+/g, "_"))} placeholder="e.g. city_mumbai_2026" required className={inputClass} />
              <p className="text-[10px] text-gray-400 mt-2 font-bold uppercase tracking-tight">Teams enter this on their phones</p>
            </div>
            <div>
              <label htmlFor="new-name" className="block text-xs font-black uppercase tracking-widest mb-2 opacity-70">Hackathon Name</label>
              <input id="new-name" type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. iQOO Mumbai 2026" required className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="new-start" className="block text-xs font-black uppercase tracking-widest mb-2 opacity-70">Start</label>
                <input id="new-start" type="datetime-local" value={newStart} onChange={(e) => setNewStart(e.target.value)} required className={inputClass} />
              </div>
              <div>
                <label htmlFor="new-end" className="block text-xs font-black uppercase tracking-widest mb-2 opacity-70">End</label>
                <input id="new-end" type="datetime-local" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} required className={inputClass} />
              </div>
            </div>
            <div>
              <label htmlFor="new-passcode" className="block text-xs font-black uppercase tracking-widest mb-2 opacity-70">Passcode</label>
              <input id="new-passcode" type="password" value={newPasscode} onChange={(e) => setNewPasscode(e.target.value)} placeholder="6+ digits" required minLength={6} className={inputClass} />
            </div>
            {createMsg && <p className={`text-sm font-bold p-3 rounded-lg border ${createMsg.includes("Created") ? "text-green-500 bg-green-500/10 border-green-500/20" : "text-red-500 bg-red-500/10 border-red-500/20"}`}>{createMsg}</p>}
            <button type="submit" disabled={loading} className="w-full rounded-xl bg-primary text-black py-4 text-sm font-black uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg shadow-primary/20">
              {loading ? "Creating..." : "Create & Launch"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
