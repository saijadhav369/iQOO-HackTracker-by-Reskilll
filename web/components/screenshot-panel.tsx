"use client";

import { useEffect, useState } from "react";

export interface ScreenshotEntry {
  id: number;
  teamId: string;
  hackathonId: string;
  requestedAt: string;
  capturedAt: string | null;
  imageUrl: string | null;
  status: string;
}

export default function ScreenshotPanel({
  teamId,
  screenshots,
  onRefresh,
}: {
  teamId: string;
  screenshots: ScreenshotEntry[];
  onRefresh: () => void;
}) {
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<ScreenshotEntry | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Oldest pending row drives the in-flight UI. Server coalesces clicks so
  // there's at most one pending request per team.
  const oldestPending = screenshots
    .filter((s) => s.status !== "captured")
    .reduce<ScreenshotEntry | null>(
      (oldest, s) =>
        !oldest || new Date(s.requestedAt) < new Date(oldest.requestedAt) ? s : oldest,
      null
    );
  const isWaitingOnPhone = oldestPending !== null;

  const [, force] = useState(0);
  useEffect(() => {
    if (!isWaitingOnPhone) return;
    const t = setInterval(() => force((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, [isWaitingOnPhone]);
  const pendingSecs = oldestPending
    ? Math.max(0, Math.round((Date.now() - new Date(oldestPending.requestedAt).getTime()) / 1000))
    : 0;

  const captureScreen = async () => {
    setRequesting(true);
    setError(null);
    try {
      const res = await fetch(`/api/team/${teamId}/screenshot`, {
        method: "POST",
        cache: "no-store",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? `Request failed (${res.status})`);
      } else {
        onRefresh();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Network error");
    }
    setRequesting(false);
  };

  const deleteScreenshot = async (id: number) => {
    if (!confirm("Delete this screenshot?")) return;
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/screenshots/${id}`, {
        method: "DELETE",
        cache: "no-store",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? `Delete failed (${res.status})`);
      } else {
        if (lightbox?.id === id) setLightbox(null);
        onRefresh();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Network error");
    }
    setDeletingId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-black uppercase tracking-tight">Screenshots</h2>
        <div className="flex items-center gap-2">
          {isWaitingOnPhone && oldestPending && (
            <button
              type="button"
              onClick={() => deleteScreenshot(oldestPending.id)}
              disabled={deletingId === oldestPending.id}
              className="px-3 py-2 text-xs font-bold rounded-lg border-2 border-red-500 text-red-600 dark:text-red-400 hover:bg-red-500 hover:text-white transition disabled:opacity-50"
            >
              Cancel pending
            </button>
          )}
          <button
            type="button"
            onClick={captureScreen}
            disabled={requesting}
            className="px-4 py-2 text-sm font-bold rounded-lg bg-black text-white dark:bg-white dark:text-black hover:opacity-80 transition disabled:opacity-50"
          >
            {isWaitingOnPhone
              ? `Waiting on phone… ${pendingSecs}s`
              : requesting
                ? "Requesting…"
                : "Capture screen"}
          </button>
        </div>
      </div>
      {isWaitingOnPhone && pendingSecs > 15 && (
        <div className="rounded-lg border-2 border-yellow-500 bg-yellow-50 dark:bg-yellow-950 px-3 py-2 text-sm font-bold text-yellow-800 dark:text-yellow-200">
          Still waiting after {pendingSecs}s. Check that the phone is online and
          running the latest APK (the screenshot poller was added in the Feature 7
          build). Hit &quot;Cancel pending&quot; to drop this request.
        </div>
      )}

      {error && (
        <div className="rounded-lg border-2 border-red-500 bg-red-50 dark:bg-red-950 px-3 py-2 text-sm font-bold text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {screenshots.length === 0 ? (
        <div className="rounded-xl border-2 border-black dark:border-white bg-white dark:bg-black p-6 text-center text-sm text-gray-500 font-bold">
          No screenshots yet. Hit &quot;Capture screen&quot; — image appears within ~10–15s.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {screenshots.map((s) => (
            <ScreenshotTile
              key={s.id}
              shot={s}
              onOpen={() => setLightbox(s)}
              onDelete={() => deleteScreenshot(s.id)}
              deleting={deletingId === s.id}
            />
          ))}
        </div>
      )}

      {lightbox && (
        <Lightbox
          shot={lightbox}
          onClose={() => setLightbox(null)}
          onDelete={() => deleteScreenshot(lightbox.id)}
          deleting={deletingId === lightbox.id}
        />
      )}
    </div>
  );
}

function ScreenshotTile({
  shot,
  onOpen,
  onDelete,
  deleting,
}: {
  shot: ScreenshotEntry;
  onOpen: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const requested = new Date(shot.requestedAt);
  const isPending = shot.status !== "captured" || !shot.imageUrl;

  const deleteBtn = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onDelete();
      }}
      disabled={deleting}
      title="Delete"
      className="absolute top-1 right-1 z-10 w-7 h-7 rounded-full bg-black/80 text-white text-sm font-bold leading-none flex items-center justify-center border border-white/40 hover:bg-red-600 disabled:opacity-50"
    >
      {deleting ? "…" : "×"}
    </button>
  );

  if (isPending) {
    return (
      <div className="relative aspect-[9/16] rounded-xl border-2 border-dashed border-gray-400 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-3 text-center">
        {deleteBtn}
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
          Pending
        </span>
        <span className="text-[10px] text-gray-400 mt-1 tabular-nums">
          {requested.toLocaleTimeString()}
        </span>
      </div>
    );
  }

  return (
    <div className="relative">
      {deleteBtn}
      <button
        type="button"
        onClick={onOpen}
        className="group block w-full aspect-[9/16] rounded-xl border-2 border-black dark:border-white overflow-hidden bg-black relative"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={shot.imageUrl!}
          alt={`Screenshot ${shot.id}`}
          className="w-full h-full object-cover group-hover:opacity-80 transition"
        />
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-left">
          <span className="text-[10px] font-bold text-white tabular-nums">
            {shot.capturedAt
              ? new Date(shot.capturedAt).toLocaleString()
              : requested.toLocaleString()}
          </span>
        </div>
      </button>
    </div>
  );
}

function Lightbox({
  shot,
  onClose,
  onDelete,
  deleting,
}: {
  shot: ScreenshotEntry;
  onClose: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <div
      role="dialog"
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative max-w-3xl max-h-full w-full bg-black rounded-xl border-2 border-white overflow-hidden"
      >
        <div className="absolute top-2 right-2 z-10 flex gap-2">
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="px-3 py-1 text-xs font-bold rounded-full bg-red-600 text-white hover:opacity-80 disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 text-xs font-bold rounded-full bg-white text-black hover:opacity-80"
          >
            Close
          </button>
        </div>
        {shot.imageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={shot.imageUrl}
            alt={`Screenshot ${shot.id}`}
            className="w-full h-auto max-h-[80vh] object-contain bg-black"
          />
        ) : (
          <div className="p-6 text-white text-sm">No image.</div>
        )}
        <div className="bg-white dark:bg-black px-4 py-3 border-t-2 border-white">
          <p className="text-xs font-bold text-gray-500 tabular-nums">
            Requested {new Date(shot.requestedAt).toLocaleString()} ·
            {shot.capturedAt
              ? ` Captured ${new Date(shot.capturedAt).toLocaleString()}`
              : " Not captured yet"}
          </p>
        </div>
      </div>
    </div>
  );
}
