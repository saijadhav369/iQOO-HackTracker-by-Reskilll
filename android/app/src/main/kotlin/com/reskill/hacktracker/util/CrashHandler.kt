package com.reskill.hacktracker.util

import android.content.Context
import android.util.Log
import com.reskill.hacktracker.data.local.HackTrackerDatabase
import com.reskill.hacktracker.data.local.entity.CrashLogEntity
import java.io.PrintWriter
import java.io.StringWriter

/**
 * Captures uncaught exceptions, writes a CrashLogEntity synchronously to Room, then
 * chains to the previous default handler so the process still dies. clean_exit is
 * left as `false` (the value set when TrackingForegroundService starts) so the
 * server can distinguish crash from offline.
 */
object CrashHandler {
    fun install(context: Context) {
        val appContext = context.applicationContext
        val previous = Thread.getDefaultUncaughtExceptionHandler()

        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            try {
                val session = SessionManager(appContext)
                val sw = StringWriter()
                throwable.printStackTrace(PrintWriter(sw))
                val entity = CrashLogEntity(
                    hackathonId = session.hackathonId,
                    teamId = session.teamId,
                    deviceId = session.deviceId,
                    occurredAt = System.currentTimeMillis(),
                    threadName = thread.name,
                    stacktrace = sw.toString(),
                    foregroundApp = session.lastForegroundApp,
                    reason = Constants.CRASH_REASON_UNCAUGHT
                )
                HackTrackerDatabase.getInstance(appContext).crashLogDao().insertBlocking(entity)
            } catch (e: Throwable) {
                Log.e("HackTracker", "Failed to persist crash log", e)
            }

            // Chain so the system still terminates the process.
            if (previous != null) {
                previous.uncaughtException(thread, throwable)
            } else {
                // No previous handler — fall back to killing the process ourselves.
                android.os.Process.killProcess(android.os.Process.myPid())
                System.exit(10)
            }
        }
    }
}
