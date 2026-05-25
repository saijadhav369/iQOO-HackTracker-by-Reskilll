"use client";

import { useState, FormEvent } from "react";

interface NotifyModalProps {
  hackathonId: string;
  onClose: () => void;
}

export default function NotifyModal({ hackathonId, onClose }: NotifyModalProps) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("all");
  const [maxTaps, setMaxTaps] = useState("");
  const [minTaps, setMinTaps] = useState("");
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);

  const inputClass = "w-full rounded-xl border border-black/5 dark:border-white/10 bg-black/5 dark:bg-white/5 px-4 py-3 text-sm font-black focus:outline-none focus:ring-2 focus:ring-primary transition-all placeholder:opacity-30";

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setStatus("");

    const body: Record<string, unknown> = { title, message, target_filter: filter };
    if (filter === "low_taps" && maxTaps) body.target_max_taps = parseInt(maxTaps);
    if (filter === "high_taps" && minTaps) body.target_min_taps = parseInt(minTaps);

    try {
      const res = await fetch(`/api/hackathon/${hackathonId}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setStatus("Sent!");
        setTimeout(() => onClose(), 1000);
      } else {
        const data = await res.json();
        setStatus(data.error || "Failed to send");
      }
    } catch {
      setStatus("Network error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 animate-in fade-in duration-300" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white dark:bg-[#0a0a0a] rounded-3xl border border-black/5 dark:border-white/5 shadow-2xl w-full max-w-lg p-8 animate-in zoom-in-95 duration-300">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">Blast Notification</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-full flex items-center justify-center bg-black/5 dark:bg-white/5 hover:bg-red-500 hover:text-white transition-all text-xl font-bold leading-none">&times;</button>
        </div>

        <form onSubmit={handleSend} className="space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Subject</label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Energy Check!" required className={inputClass} />
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Message Body</label>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. Refuel stations are open." required rows={3} className={inputClass} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Target Audience</label>
                <select value={filter} onChange={(e) => setFilter(e.target.value)} className={`${inputClass} appearance-none cursor-pointer`}>
                  <option value="all">All Devices</option>
                  <option value="active">Active Only</option>
                  <option value="idle">Idle Only</option>
                  <option value="low_taps">Low Taps</option>
                  <option value="high_taps">High Taps</option>
                </select>
              </div>

              {filter === "low_taps" && (
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Max Taps</label>
                  <input type="number" value={maxTaps} onChange={(e) => setMaxTaps(e.target.value)} placeholder="50" className={inputClass} />
                </div>
              )}
              {filter === "high_taps" && (
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Min Taps</label>
                  <input type="number" value={minTaps} onChange={(e) => setMinTaps(e.target.value)} placeholder="500" className={inputClass} />
                </div>
              )}
            </div>
          </div>

          {status && (
            <p className={`text-[10px] font-black uppercase tracking-widest text-center p-3 rounded-xl ${status === "Sent!" ? "text-green-500 bg-green-500/10" : "text-red-500 bg-red-500/10"}`}>
              {status}
            </p>
          )}

          <button type="submit" disabled={sending} className="w-full rounded-2xl bg-primary text-black py-4 text-xs font-black uppercase tracking-[0.2em] hover:brightness-110 shadow-lg shadow-primary/20 transition-all disabled:opacity-50 active:scale-[0.98]">
            {sending ? "Transmitting..." : "Send Broadcast"}
          </button>
        </form>
      </div>
    </div>
  );
}
