"use client";

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";

type Light = "red" | "green";

export default function LightToggle({ hackathonId }: { hackathonId: string }) {
  const [light, setLight] = useState<Light>("green");
  const [loading, setLoading] = useState(true);
  const [confirmTo, setConfirmTo] = useState<Light | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLight = useCallback(async () => {
    try {
      const res = await fetch(`/api/hackathon/${hackathonId}/live`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.current_light === "red" || data.current_light === "green") {
          setLight(data.current_light);
        }
      }
    } catch {
      // retry on next interval
    } finally {
      setLoading(false);
    }
  }, [hackathonId]);

  useEffect(() => {
    fetchLight();
    const interval = setInterval(fetchLight, 5000);
    return () => clearInterval(interval);
  }, [fetchLight]);

  const submit = async (next: Light) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/hackathon/${hackathonId}/light`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ light: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      setLight(next);
      setConfirmTo(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update light");
    } finally {
      setSubmitting(false);
    }
  };

  // Portal target. The toggle button sits inside the dashboard header, which
  // has `backdrop-blur-md` -> creates a CSS containing block, breaking
  // `position: fixed` for descendants. Portalling the modal to `document.body`
  // makes `fixed inset-0` viewport-relative again so it centers properly.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const target: Light = light === "green" ? "red" : "green";
  const isRed = light === "red";

  const pillBase =
    "flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl text-white transition-all shadow-lg active:scale-95";
  const pillColor = isRed
    ? "bg-red-600 hover:bg-red-700 shadow-red-500/20"
    : "bg-green-600 hover:bg-green-700 shadow-green-500/20";

  return (
    <>
      <button
        type="button"
        disabled={loading}
        onClick={() => setConfirmTo(target)}
        className={`${pillBase} ${pillColor} ${loading ? "opacity-60 cursor-not-allowed" : ""}`}
        title={`Switch to ${target.toUpperCase()}`}
      >
        <div className="relative">
          <span className={`block h-2 w-2 rounded-full bg-white ${isRed ? "animate-ping opacity-75" : ""}`} />
          <span className="absolute inset-0 h-2 w-2 rounded-full bg-white" />
        </div>
        {isRed ? "RESTRICTED" : "UNRESTRICTED"}
      </button>

      {confirmTo && mounted && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <div className="w-full max-w-md rounded-3xl border border-black/5 bg-white p-8 shadow-2xl dark:border-white/5 dark:bg-[#0a0a0a] animate-in zoom-in-95 duration-300">
            <h2 className="text-lg font-black uppercase tracking-tight">
              Switch Venue Signal?
            </h2>
            <p className="mt-4 text-xs font-bold leading-relaxed text-gray-500 uppercase tracking-widest opacity-70">
              Change status to {confirmTo === "red" ? "RESTRICTED" : "UNRESTRICTED"}. {confirmTo === "red"
                ? "Participants will receive a visual cue and status change."
                : "Participant devices will return to idle state."}
            </p>
            {error && (
              <p className="mt-6 text-xs font-black text-red-500 uppercase tracking-widest bg-red-500/10 p-4 rounded-xl">{error}</p>
            )}
            <div className="mt-8 flex gap-3">
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  setError(null);
                  setConfirmTo(null);
                }}
                className="flex-1 px-6 py-4 text-[10px] font-black uppercase tracking-widest rounded-2xl border border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => submit(confirmTo)}
                className={`flex-1 px-6 py-4 text-[10px] font-black uppercase tracking-widest rounded-2xl text-black transition-all ${
                  confirmTo === "red"
                    ? "bg-red-500 shadow-lg shadow-red-500/20"
                    : "bg-green-500 shadow-lg shadow-green-500/20"
                } ${submitting ? "opacity-60" : "hover:brightness-110 active:scale-95"}`}
              >
                {submitting ? "Processing..." : `Confirm ${confirmTo}`}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}