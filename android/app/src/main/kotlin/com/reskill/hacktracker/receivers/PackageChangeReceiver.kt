package com.reskill.hacktracker.receivers

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.reskill.hacktracker.data.local.HackTrackerDatabase
import com.reskill.hacktracker.data.local.entity.TamperEventEntity
import com.reskill.hacktracker.util.Constants
import com.reskill.hacktracker.util.SessionManager

/**
 * Logs unexpected package installs/removals during the hackathon as tamper
 * events. Registered at runtime by [com.reskill.hacktracker.services.TrackingForegroundService]
 * (a manifest receiver can't get PACKAGE_ADDED/REMOVED on Android 8+).
 *
 * App *updates* (EXTRA_REPLACING) and our own package are ignored. A non-empty
 * [Constants.PACKAGE_CHANGE_ALLOW_LIST] suppresses listed packages; empty (the
 * default) treats every change as unexpected.
 */
class PackageChangeReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        // EXTRA_REPLACING true ⇒ part of an update, not a fresh install/uninstall.
        if (intent.getBooleanExtra(Intent.EXTRA_REPLACING, false)) return

        val pkg = intent.data?.schemeSpecificPart ?: return
        if (pkg == context.packageName) return
        if (Constants.PACKAGE_CHANGE_ALLOW_LIST.contains(pkg)) return

        val type = when (action) {
            Intent.ACTION_PACKAGE_ADDED -> Constants.TAMPER_PACKAGE_ADDED
            Intent.ACTION_PACKAGE_REMOVED -> Constants.TAMPER_PACKAGE_REMOVED
            else -> return
        }

        val session = SessionManager(context)
        if (!session.isConfigured) return

        val pending = goAsync()
        Thread {
            try {
                HackTrackerDatabase.getInstance(context).tamperEventDao().insertBlocking(
                    TamperEventEntity(
                        hackathonId = session.hackathonId,
                        teamId = session.teamId,
                        deviceId = session.deviceId,
                        type = type,
                        detailJson = com.google.gson.Gson().toJson(mapOf("package" to pkg)),
                        occurredAt = System.currentTimeMillis()
                    )
                )
            } catch (_: Exception) {
            } finally {
                pending.finish()
            }
        }.start()
    }
}
