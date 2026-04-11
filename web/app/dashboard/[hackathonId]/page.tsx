"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import LiveGrid from "@/components/live-grid";
import NotifyModal from "@/components/notify-modal";

export default function DashboardPage() {
  const params = useParams();
  const hackathonId = params.hackathonId as string;
  const [showNotify, setShowNotify] = useState(false);

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <header className="border-b-2 border-black dark:border-white px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tight">HackTracker</h1>
            <p className="text-sm text-gray-500 font-medium">{hackathonId}</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowNotify(true)}
              className="px-4 py-2 text-sm font-bold rounded-lg bg-black text-white dark:bg-white dark:text-black hover:opacity-80 transition"
            >
              Send Notification
            </button>
            <a
              href={`/dashboard/${hackathonId}/manage`}
              className="px-4 py-2 text-sm font-bold rounded-lg border-2 border-black dark:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition"
            >
              Manage
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <LiveGrid hackathonId={hackathonId} />
      </main>

      {showNotify && (
        <NotifyModal
          hackathonId={hackathonId}
          onClose={() => setShowNotify(false)}
        />
      )}
    </div>
  );
}
