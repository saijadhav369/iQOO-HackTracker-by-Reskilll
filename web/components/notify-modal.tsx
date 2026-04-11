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

  const inputClass = "w-full rounded-lg border-2 border-black dark:border-white bg-transparent px-3 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white dark:bg-black rounded-2xl border-2 border-black dark:border-white shadow-xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-black uppercase tracking-tight">Send Notification</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-black dark:hover:text-white text-2xl font-bold leading-none">&times;</button>
        </div>

        <form onSubmit={handleSend} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider mb-1">Title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Keep going!" required className={inputClass} />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider mb-1">Message</label>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. 30 minutes left!" required rows={3} className={inputClass} />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider mb-1">Send to</label>
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className={inputClass}>
              <option value="all">All devices</option>
              <option value="active">Active devices only</option>
              <option value="idle">Idle devices only</option>
              <option value="low_taps">Low taps (below threshold)</option>
              <option value="high_taps">High taps (above threshold)</option>
            </select>
          </div>

          {filter === "low_taps" && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-1">Max taps threshold</label>
              <input type="number" value={maxTaps} onChange={(e) => setMaxTaps(e.target.value)} placeholder="e.g. 50" className={inputClass} />
            </div>
          )}
          {filter === "high_taps" && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-1">Min taps threshold</label>
              <input type="number" value={minTaps} onChange={(e) => setMinTaps(e.target.value)} placeholder="e.g. 500" className={inputClass} />
            </div>
          )}

          {status && <p className={`text-sm font-bold ${status === "Sent!" ? "text-green-600" : "text-red-500"}`}>{status}</p>}

          <button type="submit" disabled={sending} className="w-full rounded-lg bg-black dark:bg-white text-white dark:text-black py-3 text-sm font-black uppercase tracking-wider hover:opacity-80 transition disabled:opacity-50">
            {sending ? "Sending..." : "Send Notification"}
          </button>
        </form>
      </div>
    </div>
  );
}
