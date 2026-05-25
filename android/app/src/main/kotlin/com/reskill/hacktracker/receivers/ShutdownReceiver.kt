package com.reskill.hacktracker.receivers

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.reskill.hacktracker.util.SessionManager

/**
 * Catches graceful-shutdown signals so the next process start can tell a crash
 * from a clean offline. Registered dynamically by TrackingForegroundService.
 */
class ShutdownReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_SHUTDOWN,
            Intent.ACTION_REBOOT,
            Intent.ACTION_BATTERY_LOW -> {
                SessionManager(context).cleanExit = true
            }
        }
    }
}
