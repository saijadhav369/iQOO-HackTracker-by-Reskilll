"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";

type FacePhoto = {
  id: number;
  teamId: string;
  teamName: string | null;
  deviceId: string | null;
  imei: string | null;
  imageUrl: string;
  capturedAt: string;
};

const POLL_MS = 15_000;

export default function RegistrationsPage() {
  const params = useParams();
  const hackathonId = params.hackathonId as string;
  const [rows, setRows] = useState<FacePhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(
          `/api/hackathon/${encodeURIComponent(hackathonId)}/face-photos`,
          { cache: "no-store" }
        );
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as FacePhoto[];
        if (!cancelled) {
          setRows(data);
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

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

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
                Registrations
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
        {loading && rows.length === 0 ? (
          <p className="text-sm opacity-60">Loading…</p>
        ) : error ? (
          <p className="text-sm text-red-500">Failed to load: {error}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm opacity-60">
            No registration photos captured yet. Open the &ldquo;Register&rdquo;
            launcher icon on a device, enter the admin passcode, and take a
            photo.
          </p>
        ) : (
          <div className="rounded-2xl border border-black/10 dark:border-white/10 overflow-hidden bg-white dark:bg-[#0a0a0a]">
            <table className="w-full text-sm">
              <thead className="bg-black/5 dark:bg-white/5">
                <tr className="text-left">
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest">
                    Photo
                  </th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest">
                    IMEI / Device ID
                  </th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest">
                    Team
                  </th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest">
                    Captured
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-t border-black/5 dark:border-white/5"
                  >
                    <td className="px-4 py-3">
                      <a
                        href={row.imageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={row.imageUrl}
                          alt={`Face for ${row.teamName ?? row.teamId}`}
                          className="w-16 h-16 object-cover rounded-lg border border-black/10 dark:border-white/10"
                          loading="lazy"
                        />
                      </a>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {row.imei ? (
                        <span title="IMEI (device-owner install)">{row.imei}</span>
                      ) : row.deviceId ? (
                        <span
                          className="opacity-70"
                          title="IMEI unavailable on this install; showing Android device ID instead"
                        >
                          {row.deviceId}
                          <span className="ml-1 opacity-50">(device id)</span>
                        </span>
                      ) : (
                        <span className="opacity-50">(unavailable)</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={`/dashboard/${hackathonId}/team/${row.teamId}`}
                        className="hover:text-primary transition"
                      >
                        {row.teamName ?? row.teamId}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-xs opacity-70">
                      {formatTime(row.capturedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
