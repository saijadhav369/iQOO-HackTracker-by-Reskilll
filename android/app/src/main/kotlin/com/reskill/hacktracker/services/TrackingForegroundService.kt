package com.reskill.hacktracker.services

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.app.usage.UsageStatsManager
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.reskill.hacktracker.data.local.entity.AppUsageEntity
import com.reskill.hacktracker.data.repository.TrackingRepository
import com.reskill.hacktracker.ui.SetupActivity
import com.reskill.hacktracker.util.Constants
import com.reskill.hacktracker.util.SessionManager
import kotlinx.coroutines.*

class TrackingForegroundService : Service() {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private lateinit var repository: TrackingRepository
    private lateinit var session: SessionManager
    private var clipboardListener: ClipboardManager.OnPrimaryClipChangedListener? = null

    override fun onCreate() {
        super.onCreate()
        repository = TrackingRepository(applicationContext)
        session = SessionManager(applicationContext)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(Constants.NOTIFICATION_ID, createNotification())
        startTimers()
        setupClipboardListener()
        return START_STICKY
    }

    private fun createNotification(): Notification {
        val tapIntent = Intent(this, SetupActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, Constants.NOTIFICATION_CHANNEL_ID)
            .setContentTitle("HackTracker by Reskill")
            .setContentText("Tracking your build session")
            .setSmallIcon(android.R.drawable.ic_menu_info_details)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun startTimers() {
        // Sync event batches every 60s
        scope.launch {
            while (isActive) {
                delay(Constants.EVENT_BATCH_INTERVAL_MS)
                try { repository.syncEventBatches() } catch (_: Exception) {}
            }
        }

        // Poll UsageStats every 5 min
        scope.launch {
            while (isActive) {
                delay(Constants.USAGE_STATS_INTERVAL_MS)
                try {
                    pollUsageStats()
                    repository.syncAppUsage()
                } catch (_: Exception) {}
            }
        }

        // Heartbeat every 30s + check for push notifications
        scope.launch {
            while (isActive) {
                delay(Constants.HEARTBEAT_INTERVAL_MS)
                try {
                    val notifications = repository.sendHeartbeatAndGetNotifications()
                    for (notif in notifications) {
                        showPushNotification(notif.first, notif.second, notif.third)
                    }
                } catch (_: Exception) {}
            }
        }
    }

    private fun showPushNotification(id: Long, title: String, message: String) {
        val notification = NotificationCompat.Builder(this, Constants.NOTIFICATION_CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(message)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .build()

        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(Constants.NOTIFICATION_ID + id.toInt(), notification)
    }

    private suspend fun pollUsageStats() {
        val usageManager = getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
            ?: return

        val now = System.currentTimeMillis()
        val fiveMinAgo = now - Constants.USAGE_STATS_INTERVAL_MS

        val stats = usageManager.queryUsageStats(
            UsageStatsManager.INTERVAL_BEST, fiveMinAgo, now
        )

        if (stats.isNullOrEmpty()) return

        val entries = stats
            .filter { it.totalTimeInForeground > 0 }
            .map { stat ->
                AppUsageEntity(
                    hackathonId = session.hackathonId,
                    teamId = session.teamId,
                    snapshotTime = now,
                    appPackage = stat.packageName,
                    appLabel = null,
                    foregroundMinutes = stat.totalTimeInForeground / 60000f,
                    openCount = 0
                )
            }

        repository.saveAppUsage(entries)
    }

    private fun setupClipboardListener() {
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return
        clipboardListener = ClipboardManager.OnPrimaryClipChangedListener {
            scope.launch {
                try { repository.sendClipboardEvent() } catch (_: Exception) {}
            }
        }
        clipboard.addPrimaryClipChangedListener(clipboardListener)
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        val restartIntent = Intent(this, TrackingForegroundService::class.java)
        startForegroundService(restartIntent)
    }

    override fun onDestroy() {
        super.onDestroy()
        scope.cancel()
        clipboardListener?.let {
            val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
            clipboard?.removePrimaryClipChangedListener(it)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
