package com.reskill.hacktracker.services

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.app.usage.UsageStatsManager
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.database.ContentObserver
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import androidx.core.app.NotificationCompat
import android.graphics.Color
import com.reskill.hacktracker.data.local.HackTrackerDatabase
import com.reskill.hacktracker.data.local.entity.AppUsageEntity
import com.reskill.hacktracker.data.local.entity.CrashLogEntity
import com.reskill.hacktracker.data.repository.TrackingRepository
import com.reskill.hacktracker.receivers.PackageChangeReceiver
import com.reskill.hacktracker.receivers.ShutdownReceiver
import com.reskill.hacktracker.ui.LightStateOverlay
import com.reskill.hacktracker.ui.SetupActivity
import com.reskill.hacktracker.util.Constants
import com.reskill.hacktracker.util.DeviceOwnerPolicy
import com.reskill.hacktracker.util.SessionManager
import com.reskill.hacktracker.util.SessionTracker
import kotlinx.coroutines.*

class TrackingForegroundService : Service() {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private lateinit var repository: TrackingRepository
    private lateinit var session: SessionManager
    private var clipboardListener: ClipboardManager.OnPrimaryClipChangedListener? = null
    private var overlay: LightStateOverlay? = null
    private var lastAppliedLight: String? = null
    private var sensorTracker: SensorTracker? = null
    private var sessionTracker: SessionTracker? = null
    private var shutdownReceiver: ShutdownReceiver? = null
    private var packageChangeReceiver: PackageChangeReceiver? = null
    private var adbObserver: ContentObserver? = null

    // Feature 10 time-drift detection. Snapshots from the previous 60s sync tick:
    // a clean clock advances wall-clock and monotonic time by the same delta.
    private var prevElapsedRealtimeNanos = 0L
    private var prevWallClockMs = 0L

    // Screenshot poller state — last in-flight id avoids re-capturing the same
    // request while an upload is still pending.
    @Volatile
    private var inFlightScreenshotId: Long = 0L
    private val screenshotInFlightLock = Any()

    // mediaProjection FGS type only activated when the fallback path is used.
    @Volatile
    private var mediaProjectionFgsActive: Boolean = false

    // Idempotency guard: onStartCommand can fire multiple times (START_STICKY
    // redelivery, foreground-service auto-restart from SetupActivity, etc.).
    // Without this every restart stacks a fresh set of heartbeat/event-batch/
    // usage-stats coroutines on top of the previous ones — confirmed in the
    // dev log by paired heartbeats ~40-200ms apart from the same device.
    private var timersStarted = false

    override fun onCreate() {
        super.onCreate()
        instance = this
        repository = TrackingRepository(applicationContext)
        session = SessionManager(applicationContext)
        overlay = LightStateOverlay(applicationContext)
        sensorTracker = SensorTracker(applicationContext, repository, session)
        sessionTracker = SessionTracker(applicationContext, session)

        detectAndLogDirtyExit()
        // From this run on we are dirty until either the passcode-authorised
        // stop path or ShutdownReceiver flips clean_exit back to true.
        session.cleanExit = false

        registerShutdownReceiver()
        registerPackageChangeReceiver()
        registerAdbObserver()
    }

    // PACKAGE_ADDED/REMOVED can't be received by a manifest receiver on API 26+,
    // so register at runtime. Data scheme "package" is mandatory for these.
    private fun registerPackageChangeReceiver() {
        val receiver = PackageChangeReceiver()
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_PACKAGE_ADDED)
            addAction(Intent.ACTION_PACKAGE_REMOVED)
            addDataScheme("package")
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            registerReceiver(receiver, filter)
        }
        packageChangeReceiver = receiver
    }

    // Watch Settings.Global.ADB_ENABLED. A device-owner sets it to 0; any change
    // (especially 0→1 re-enabling USB/wireless debugging) is logged as tamper.
    private fun registerAdbObserver() {
        val uri = Settings.Global.getUriFor(Settings.Global.ADB_ENABLED) ?: return
        val observer = object : ContentObserver(Handler(Looper.getMainLooper())) {
            override fun onChange(selfChange: Boolean) {
                val newValue = try {
                    Settings.Global.getInt(contentResolver, Settings.Global.ADB_ENABLED, -1)
                } catch (_: Exception) { -1 }
                scope.launch {
                    try {
                        repository.logTamperEvent(
                            Constants.TAMPER_ADB_TOGGLED,
                            mapOf("newValue" to newValue)
                        )
                    } catch (_: Exception) {}
                }
            }
        }
        try {
            contentResolver.registerContentObserver(uri, false, observer)
            adbObserver = observer
        } catch (_: Exception) {}
    }

    /**
     * Compare wall-clock vs monotonic deltas since the previous 60s tick. A clean
     * clock advances both equally; a manual date/time change (or NTP jump) shows
     * up as divergence. First tick just seeds the snapshot.
     */
    private suspend fun checkTimeDrift() {
        val nowElapsed = SystemClock.elapsedRealtimeNanos()
        val nowWall = System.currentTimeMillis()
        if (prevElapsedRealtimeNanos != 0L) {
            val elapsedDeltaMs = (nowElapsed - prevElapsedRealtimeNanos) / 1_000_000L
            val wallDeltaMs = nowWall - prevWallClockMs
            val driftMs = wallDeltaMs - elapsedDeltaMs
            if (kotlin.math.abs(driftMs) > Constants.TIME_DRIFT_THRESHOLD_MS) {
                try {
                    repository.logTamperEvent(
                        Constants.TAMPER_TIME_DRIFT,
                        mapOf("drift_ms" to driftMs)
                    )
                } catch (_: Exception) {}
            }
        }
        prevElapsedRealtimeNanos = nowElapsed
        prevWallClockMs = nowWall
    }

    /**
     * If the previous run ended without flipping clean_exit=true AND its last
     * heartbeat is older than the crash recovery threshold, drop a
     * recovered_dirty marker into the crash log so organisers see *something*
     * even when the uncaught handler couldn't fire (kernel OOM kill, force
     * stop, battery yanked).
     */
    private fun detectAndLogDirtyExit() {
        if (!session.isConfigured) return
        if (session.cleanExit) return
        val lastHb = session.lastHeartbeatSentAt
        if (lastHb == 0L) return
        val age = System.currentTimeMillis() - lastHb
        if (age < Constants.CRASH_RECOVERY_THRESHOLD_MS) return

        val marker = CrashLogEntity(
            hackathonId = session.hackathonId,
            teamId = session.teamId,
            deviceId = session.deviceId,
            occurredAt = System.currentTimeMillis(),
            threadName = null,
            stacktrace = "Process died without graceful shutdown. " +
                "Last heartbeat was ${age / 1000}s ago.",
            foregroundApp = session.lastForegroundApp,
            reason = Constants.CRASH_REASON_RECOVERED_DIRTY
        )
        scope.launch {
            try {
                HackTrackerDatabase.getInstance(applicationContext)
                    .crashLogDao().insert(marker)
            } catch (_: Exception) {}
        }
    }

    private fun registerShutdownReceiver() {
        val receiver = ShutdownReceiver()
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_SHUTDOWN)
            addAction(Intent.ACTION_REBOOT)
            addAction(Intent.ACTION_BATTERY_LOW)
        }
        // RECEIVER_NOT_EXPORTED on Android 13+ — these are system broadcasts.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            registerReceiver(receiver, filter)
        }
        shutdownReceiver = receiver
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForegroundWithCurrentType()
        applyLight(session.currentLight, force = true)
        if (!timersStarted) {
            timersStarted = true
            startTimers()
            setupClipboardListener()
            sensorTracker?.start()
            sessionTracker?.start()
            android.util.Log.w("HackTracker", "TrackingForegroundService: timers started")
        } else {
            android.util.Log.w("HackTracker", "TrackingForegroundService: onStartCommand re-entry — timers already running, no-op")
        }
        return START_STICKY
    }

    private fun startForegroundWithCurrentType() {
        val notif = createNotification(session.currentLight)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val type = if (mediaProjectionFgsActive) {
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE or
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            } else {
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
            }
            startForeground(Constants.NOTIFICATION_ID, notif, type)
        } else {
            startForeground(Constants.NOTIFICATION_ID, notif)
        }
    }

    /**
     * Promote the foreground service to include mediaProjection type and return
     * a live [MediaProjection]. On API 34+ the FGS type MUST be set before
     * MediaProjectionManager.getMediaProjection is called.
     *
     * Returns null if no consent intent is held or projection creation fails.
     */
    fun ensureMediaProjection(): MediaProjection? {
        MediaProjectionHolder.projection?.let {
            android.util.Log.w("HackTracker", "ensureMediaProjection: reusing live projection")
            return it
        }
        val data = MediaProjectionHolder.resultData
        if (data == null) {
            android.util.Log.w("HackTracker", "ensureMediaProjection: no consent intent — user must re-authorise in SetupActivity")
            return null
        }
        if (!mediaProjectionFgsActive) {
            mediaProjectionFgsActive = true
            try { startForegroundWithCurrentType() } catch (e: Exception) {
                android.util.Log.w("HackTracker", "Promote FGS type failed", e)
                mediaProjectionFgsActive = false
                return null
            }
        }
        val mpm = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as? MediaProjectionManager
            ?: return null
        return try {
            val projection = mpm.getMediaProjection(MediaProjectionHolder.resultCode, data)
            if (projection == null) {
                android.util.Log.w("HackTracker", "getMediaProjection returned null — consent intent likely consumed; clearing")
                MediaProjectionHolder.clear()
                return null
            }
            projection.registerCallback(object : MediaProjection.Callback() {
                override fun onStop() {
                    // System stopped the projection (user dismissed casting notif,
                    // inactivity, etc.). The consent intent is now one-shot-consumed,
                    // so wipe it too — the next capture attempt logs the missing-
                    // consent state and SetupActivity.onResume re-prompts.
                    android.util.Log.w("HackTracker", "MediaProjection.onStop fired — clearing consent")
                    MediaProjectionHolder.clear()
                }
            }, null)
            MediaProjectionHolder.projection = projection
            android.util.Log.w("HackTracker", "ensureMediaProjection: new projection ready")
            projection
        } catch (e: Exception) {
            android.util.Log.w("HackTracker", "getMediaProjection threw — clearing consent", e)
            MediaProjectionHolder.clear()
            null
        }
    }

    private fun createNotification(light: String): Notification {
        val tapIntent = Intent(this, SetupActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val isRed = light == Constants.LIGHT_RED
        val title = if (isRed) "HackTracker — RED light" else "HackTracker by Reskill"
        val text = if (isRed) "Venue is on red light" else "Tracking your build session"
        val icon = if (isRed) android.R.drawable.ic_notification_overlay else android.R.drawable.ic_menu_info_details
        // red-600 / green-600
        val color = if (isRed) Color.parseColor("#DC2626") else Color.parseColor("#16A34A")

        return NotificationCompat.Builder(this, Constants.NOTIFICATION_CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(icon)
            .setColor(color)
            .setColorized(true)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun applyLight(light: String, force: Boolean = false) {
        val isRed = light == Constants.LIGHT_RED
        val overlayNeedsAttention = isRed && overlay?.isShown() != true
        val changed = light != lastAppliedLight

        // Always reconcile overlay state — if SYSTEM_ALERT_WINDOW was granted
        // after the last attempt, this is how the strip gets retried.
        if (isRed) {
            overlay?.show()
        } else {
            overlay?.hide()
        }

        if (!force && !changed && !overlayNeedsAttention) return
        lastAppliedLight = light

        // Device-owner only: disable the status bar (quick-settings shade,
        // notification pull-down) while Red so participants can't reach toggles
        // there; restore on Green. Silently no-ops when not device-owner.
        DeviceOwnerPolicy.setStatusBarDisabled(applicationContext, isRed)

        val manager = getSystemService(NotificationManager::class.java)
        manager?.notify(Constants.NOTIFICATION_ID, createNotification(light))
    }

    private fun startTimers() {
        // Sync event batches + sensor aggregates + crash logs + tamper events
        // every 60s. Time-drift is sampled here too so it shares the same cadence
        // as the batch flush.
        scope.launch {
            while (isActive) {
                delay(Constants.EVENT_BATCH_INTERVAL_MS)
                try { checkTimeDrift() } catch (_: Exception) {}
                try { repository.syncEventBatches() } catch (_: Exception) {}
                try { repository.syncSensorAggregates() } catch (_: Exception) {}
                try { repository.syncCrashLogs() } catch (_: Exception) {}
                try { repository.syncTamperEvents() } catch (_: Exception) {}
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

        // Heartbeat every 30s + check for push notifications + sync light state
        scope.launch {
            while (isActive) {
                delay(Constants.HEARTBEAT_INTERVAL_MS)
                try {
                    sessionTracker?.onHeartbeatTick()
                    val result = repository.sendHeartbeatAndGetNotifications()
                    result.currentLight?.let { light ->
                        if (light != session.currentLight) {
                            session.currentLight = light
                        }
                        withContext(Dispatchers.Main) { applyLight(light) }
                    }
                    for (notif in result.notifications) {
                        showPushNotification(notif.first, notif.second, notif.third)
                    }
                    result.pendingScreenshotId?.let { handleScreenshotRequest(it) }
                } catch (_: Exception) {}
            }
        }
    }

    private fun handleScreenshotRequest(requestId: Long) {
        // Atomic check-and-set — without this, two near-simultaneous heartbeats
        // (e.g. duplicate-coroutine fallout, or two retries within a second)
        // could both see inFlight==0L, both kick a capture, and the second
        // takeScreenshot returns ERROR_INTERVAL_TIME_SHORT (1s rate limit).
        synchronized(screenshotInFlightLock) {
            if (inFlightScreenshotId == requestId || inFlightScreenshotId != 0L) {
                android.util.Log.w("HackTracker", "Screenshot $requestId skipped — in-flight=$inFlightScreenshotId")
                return
            }
            inFlightScreenshotId = requestId
        }
        android.util.Log.w("HackTracker", "Screenshot $requestId picked up, capturing…")
        scope.launch {
            val start = System.currentTimeMillis()
            try {
                // Sensitive op: ensure the device-owner lock-task whitelist is in
                // place so a kiosk pin is possible around capture. No-op when not
                // device-owner. (Pinning itself needs an Activity; a service can
                // only maintain the whitelist.)
                DeviceOwnerPolicy.ensureLockTaskWhitelist(applicationContext)
                val bytes = ScreenshotCaptor.capture(applicationContext)
                if (bytes == null) {
                    android.util.Log.w(
                        "HackTracker",
                        "Screenshot $requestId capture returned null after ${System.currentTimeMillis() - start}ms"
                    )
                } else {
                    val ok = repository.uploadScreenshot(requestId, bytes)
                    android.util.Log.w(
                        "HackTracker",
                        "Screenshot $requestId upload ${if (ok) "OK" else "FAILED"} (${bytes.size}b, ${System.currentTimeMillis() - start}ms)"
                    )
                }
            } catch (e: Exception) {
                android.util.Log.w("HackTracker", "Screenshot $requestId capture/upload threw", e)
            } finally {
                // Allow retry next tick if upload failed (server still returns
                // pending_screenshot_id until the row is marked captured).
                if (inFlightScreenshotId == requestId) inFlightScreenshotId = 0L
            }
        }
    }

    private fun showPushNotification(id: Long, title: String, message: String) {
        // Posted on the high-importance push channel so participants get a
        // heads-up + sound. The LOW tracking channel only backs the ongoing
        // foreground notification and must stay silent.
        val notification = NotificationCompat.Builder(this, Constants.NOTIFICATION_CHANNEL_PUSH_ID)
            .setContentTitle(title)
            .setContentText(message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(message))
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
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

        val pm = packageManager
        val labelCache = HashMap<String, String?>()
        fun labelFor(pkg: String): String? = labelCache.getOrPut(pkg) {
            try {
                pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
            } catch (_: Exception) {
                null
            }
        }

        val entries = stats
            .filter { it.totalTimeInForeground > 0 }
            .map { stat ->
                AppUsageEntity(
                    hackathonId = session.hackathonId,
                    teamId = session.teamId,
                    snapshotTime = now,
                    appPackage = stat.packageName,
                    appLabel = labelFor(stat.packageName),
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
        sensorTracker?.stop()
        sessionTracker?.stop()
        scope.cancel()
        clipboardListener?.let {
            val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
            clipboard?.removePrimaryClipChangedListener(it)
        }
        overlay?.hide()
        shutdownReceiver?.let {
            try { unregisterReceiver(it) } catch (_: Exception) {}
        }
        shutdownReceiver = null
        packageChangeReceiver?.let {
            try { unregisterReceiver(it) } catch (_: Exception) {}
        }
        packageChangeReceiver = null
        adbObserver?.let {
            try { contentResolver.unregisterContentObserver(it) } catch (_: Exception) {}
        }
        adbObserver = null
        MediaProjectionHolder.projection?.let {
            try { it.stop() } catch (_: Exception) {}
        }
        MediaProjectionHolder.projection = null
        if (instance === this) instance = null
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        @Volatile
        var instance: TrackingForegroundService? = null
            private set
    }
}
