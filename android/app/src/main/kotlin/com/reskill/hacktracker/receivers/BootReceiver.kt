package com.reskill.hacktracker.receivers

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.reskill.hacktracker.services.TrackingForegroundService
import com.reskill.hacktracker.util.SessionManager

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            val session = SessionManager(context)
            if (session.isTracking && session.isConfigured) {
                val serviceIntent = Intent(context, TrackingForegroundService::class.java)
                context.startForegroundService(serviceIntent)
            }
        }
    }
}
