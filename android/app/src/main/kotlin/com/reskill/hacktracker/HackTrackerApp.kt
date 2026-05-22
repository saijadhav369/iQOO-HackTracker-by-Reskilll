package com.reskill.hacktracker

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.graphics.Color
import android.media.AudioAttributes
import android.provider.Settings
import com.reskill.hacktracker.data.local.HackTrackerDatabase
import com.reskill.hacktracker.data.local.entity.TamperEventEntity
import com.reskill.hacktracker.util.Constants
import com.reskill.hacktracker.util.CrashHandler
import com.reskill.hacktracker.util.SessionManager

class HackTrackerApp : Application() {
    override fun onCreate() {
        super.onCreate()
        CrashHandler.install(this)
        createNotificationChannel()
        detectSafeModeBoot()
    }

    /**
     * Safe Mode disables third-party apps — including our accessibility and
     * foreground services — so it's a prime uninstall/bypass runway. We can't
     * stop the boot, but we can latch a flag (PasscodeActivity then refuses to
     * unlock until a normal reboot) and queue a tamper event that syncs once the
     * device is back to a normal boot. The live PackageManager.isSafeMode reading
     * also *clears* the flag on a normal boot.
     */
    private fun detectSafeModeBoot() {
        val safe = try { packageManager.isSafeMode } catch (_: Exception) { false }
        val session = SessionManager(this)
        session.bootSafeMode = safe
        if (safe && session.isConfigured) {
            Thread {
                try {
                    HackTrackerDatabase.getInstance(this).tamperEventDao().insertBlocking(
                        TamperEventEntity(
                            hackathonId = session.hackathonId,
                            teamId = session.teamId,
                            deviceId = session.deviceId,
                            type = Constants.TAMPER_SAFE_MODE,
                            detailJson = "{}",
                            occurredAt = System.currentTimeMillis()
                        )
                    )
                } catch (_: Exception) {}
            }.start()
        }
    }

    private fun createNotificationChannel() {
        val tracking = NotificationChannel(
            Constants.NOTIFICATION_CHANNEL_ID,
            getString(R.string.notification_channel_name),
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = getString(R.string.notification_channel_description)
            setShowBadge(false)
        }

        // High-importance channel for organiser pushes — surfaces as heads-up
        // with sound/vibration. The LOW channel above stays silent because it
        // backs the ongoing foreground-service notification.
        val push = NotificationChannel(
            Constants.NOTIFICATION_CHANNEL_PUSH_ID,
            getString(R.string.notification_channel_push_name),
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = getString(R.string.notification_channel_push_description)
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 250, 150, 250)
            setShowBadge(true)
            enableLights(true)
            lightColor = Color.GREEN
            // Explicit chime so the heads-up always rings, independent of the
            // device's per-channel defaults. USAGE_NOTIFICATION + SONIFICATION
            // routes it through the notification stream at the right volume.
            val audioAttributes = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
            setSound(Settings.System.DEFAULT_NOTIFICATION_URI, audioAttributes)
        }

        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(tracking)
        manager.createNotificationChannel(push)
    }
}
