package com.reskill.hacktracker.util

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.PowerManager

/**
 * Tracks the start of the current continuous screen-on session.
 *
 * A session opens on the first SCREEN_ON tick (or on the first heartbeat
 * while interactive, for the boot-with-screen-on case) and closes on
 * SCREEN_OFF. Persistence is in SessionManager so a process restart does
 * not lose an open session.
 *
 * Gap-based session ending (>2 min without a heartbeat) is handled
 * server-side from the heartbeat trail.
 */
class SessionTracker(
    private val context: Context,
    private val session: SessionManager
) {
    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context?, intent: Intent?) {
            when (intent?.action) {
                Intent.ACTION_SCREEN_ON -> startIfMissing()
                Intent.ACTION_SCREEN_OFF -> end()
            }
        }
    }
    private var registered = false

    fun start() {
        if (registered) return
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_ON)
            addAction(Intent.ACTION_SCREEN_OFF)
        }
        context.registerReceiver(receiver, filter)
        registered = true
        if (isScreenOn()) startIfMissing()
    }

    fun stop() {
        if (!registered) return
        try { context.unregisterReceiver(receiver) } catch (_: Exception) {}
        registered = false
    }

    /** Called from the heartbeat loop — covers the boot-with-screen-on edge. */
    fun onHeartbeatTick() {
        if (isScreenOn() && session.currentSessionStart == null) {
            startIfMissing()
        }
    }

    private fun startIfMissing() {
        if (session.currentSessionStart == null) {
            session.currentSessionStart = System.currentTimeMillis()
        }
    }

    private fun end() {
        session.currentSessionStart = null
    }

    private fun isScreenOn(): Boolean {
        val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
        return pm?.isInteractive == true
    }
}
