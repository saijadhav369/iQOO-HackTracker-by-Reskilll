"use client";

import { useEffect, useRef, useState } from "react";

interface ExportButtonProps {
  scope: "team" | "hackathon";
  hackathonId: string;
  teamId?: string;
}

// Single chip ("Export ▾") that opens a 2-item popover (PDF / Excel). On
// selection we hand the URL to window.location.assign — the browser sends the
// session cookie and saves the streamed download natively. Avoids the
// loading-spinner UX entirely (the browser owns the progress bar).
export default function ExportButton({
  scope,
  hackathonId,
  teamId,
}: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const baseUrl =
    scope === "team"
      ? `/api/team/${teamId}/export`
      : `/api/hackathon/${hackathonId}/export`;

  const trigger = (fmt: "pdf" | "xlsx") => {
    setOpen(false);
    window.location.assign(`${baseUrl}?format=${fmt}`);
  };

  const chipClass =
    "px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl bg-primary text-black shadow-lg shadow-primary/20 hover:brightness-110 active:scale-[0.98] transition-all";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={chipClass}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        Export <span className="opacity-70">▾</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-44 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#0a0a0a] shadow-2xl overflow-hidden z-50"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => trigger("pdf")}
            className="w-full text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest hover:bg-primary hover:text-black transition-colors"
          >
            PDF
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => trigger("xlsx")}
            className="w-full text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest hover:bg-primary hover:text-black transition-colors border-t border-black/5 dark:border-white/5"
          >
            Excel
          </button>
        </div>
      )}
    </div>
  );
}
