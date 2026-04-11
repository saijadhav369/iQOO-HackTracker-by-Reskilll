package com.reskill.hacktracker.services

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import com.reskill.hacktracker.data.repository.TrackingRepository
import com.reskill.hacktracker.ui.PasscodeActivity
import com.reskill.hacktracker.util.SessionManager
import kotlinx.coroutines.*
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

class HackTrackerAccessibilityService : AccessibilityService() {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private lateinit var repository: TrackingRepository
    private lateinit var session: SessionManager

    // Counters (reset every 60 seconds)
    private val tapCount = AtomicInteger(0)
    private val textInputCount = AtomicInteger(0)
    private val scrollCount = AtomicInteger(0)
    private val appSwitchCount = AtomicInteger(0)
    private val longPressCount = AtomicInteger(0)
    private val notificationCount = AtomicInteger(0)
    private val perAppTaps = ConcurrentHashMap<String, AtomicInteger>()
    private val perAppScrolls = ConcurrentHashMap<String, AtomicInteger>()
    private val perAppTextInputs = ConcurrentHashMap<String, AtomicInteger>()

    @Volatile
    private var currentForegroundApp: String? = null

    @Volatile
    private var lastForegroundApp: String? = null

    @Volatile
    private var periodStartTime: Long = System.currentTimeMillis()

    private var batchJob: Job? = null

    // Public accessors
    val totalTaps: Int get() = tapCount.get()
    val currentApp: String? get() = currentForegroundApp

    // Passcode bypass: after entering passcode, allow Settings for 5 min
    @Volatile
    var passcodeBypassUntil: Long = 0L

    override fun onCreate() {
        super.onCreate()
        repository = TrackingRepository(applicationContext)
        session = SessionManager(applicationContext)
        instance = this
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        periodStartTime = System.currentTimeMillis()
        startBatchTimer()
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null || !session.isTracking) return

        val packageName = event.packageName?.toString() ?: return

        when (event.eventType) {
            AccessibilityEvent.TYPE_VIEW_CLICKED -> {
                tapCount.incrementAndGet()
                perAppTaps.getOrPut(packageName) { AtomicInteger(0) }.incrementAndGet()
            }

            AccessibilityEvent.TYPE_VIEW_LONG_CLICKED -> {
                longPressCount.incrementAndGet()
                // Also count as a tap
                tapCount.incrementAndGet()
                perAppTaps.getOrPut(packageName) { AtomicInteger(0) }.incrementAndGet()
            }

            AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED -> {
                textInputCount.incrementAndGet()
                perAppTextInputs.getOrPut(packageName) { AtomicInteger(0) }.incrementAndGet()
            }

            AccessibilityEvent.TYPE_VIEW_SCROLLED -> {
                scrollCount.incrementAndGet()
                perAppScrolls.getOrPut(packageName) { AtomicInteger(0) }.incrementAndGet()
            }

            AccessibilityEvent.TYPE_NOTIFICATION_STATE_CHANGED -> {
                // Count notifications received (not from our own app)
                if (packageName != "com.reskill.hacktracker") {
                    notificationCount.incrementAndGet()
                }
            }

            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> {
                val className = event.className?.toString() ?: ""

                // Detect app switch — ignore keyboards and system UI
                val isIgnored = packageName.contains("inputmethod", ignoreCase = true) ||
                    packageName == "com.android.systemui"

                if (!isIgnored && packageName != currentForegroundApp) {
                    lastForegroundApp = currentForegroundApp
                    currentForegroundApp = packageName
                    if (lastForegroundApp != null) {
                        appSwitchCount.incrementAndGet()
                    }

                    // Detect camera open — send event immediately
                    if (packageName.contains("camera", ignoreCase = true)) {
                        scope.launch {
                            try { repository.sendCameraEvent() } catch (_: Exception) {}
                        }
                    }
                }

                // Log all Settings window changes for debugging
                if (packageName == "com.android.settings") {
                    Log.w("HackTracker", "SETTINGS window: className=$className pkg=$packageName")
                }

                // Tamper detection: gate specific dangerous Settings pages
                // Allow if organiser entered passcode recently (bypass window)
                if (System.currentTimeMillis() >= passcodeBypassUntil &&
                    packageName == "com.android.settings"
                ) {
                    val lowerClass = className.lowercase()
                    val isDangerous = lowerClass.contains("accessibility") ||
                        lowerClass.contains("subsettings") ||
                        lowerClass.contains("usageaccess") ||
                        lowerClass.contains("specialaccess") ||
                        lowerClass.contains("special_access") ||
                        lowerClass.contains("installedappdetail") ||
                        lowerClass.contains("appinfo") ||
                        lowerClass.contains("deviceadmin") ||
                        lowerClass.contains("device_admin") ||
                        lowerClass.contains("manageapplication") ||
                        lowerClass.contains("notificationaccess")

                    if (isDangerous) {
                        Log.w("HackTracker", "BLOCKED! className=$className")
                        showPasscodeChallenge()
                    }
                }
            }
        }
    }

    private fun startBatchTimer() {
        batchJob = scope.launch {
            while (isActive) {
                delay(com.reskill.hacktracker.util.Constants.EVENT_BATCH_INTERVAL_MS)
                flushBatch()
            }
        }
    }

    private suspend fun flushBatch() {
        val now = System.currentTimeMillis()
        val taps = tapCount.getAndSet(0)
        val texts = textInputCount.getAndSet(0)
        val scrolls = scrollCount.getAndSet(0)
        val switches = appSwitchCount.getAndSet(0)
        val longPresses = longPressCount.getAndSet(0)
        val notifications = notificationCount.getAndSet(0)

        // Copy and clear per-app maps
        val appTaps = HashMap<String, Int>()
        for ((key, value) in perAppTaps) {
            val count = value.getAndSet(0)
            if (count > 0) appTaps[key] = count
        }
        val appScrolls = HashMap<String, Int>()
        for ((key, value) in perAppScrolls) {
            val count = value.getAndSet(0)
            if (count > 0) appScrolls[key] = count
        }
        val appTexts = HashMap<String, Int>()
        for ((key, value) in perAppTextInputs) {
            val count = value.getAndSet(0)
            if (count > 0) appTexts[key] = count
        }

        val start = periodStartTime
        periodStartTime = now

        // Only save if there was any activity
        if (taps > 0 || texts > 0 || scrolls > 0 || switches > 0 || notifications > 0) {
            repository.saveEventBatch(
                taps = taps,
                textInputs = texts,
                scrolls = scrolls,
                appSwitches = switches,
                longPresses = longPresses,
                notifications = notifications,
                perAppTaps = appTaps,
                perAppScrolls = appScrolls,
                perAppTextInputs = appTexts,
                foregroundApp = currentForegroundApp,
                periodStart = start,
                periodEnd = now
            )
        }
    }

    private fun showPasscodeChallenge() {
        val intent = Intent(this, PasscodeActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            putExtra("source", "tamper_detection")
        }
        startActivity(intent)
    }

    override fun onInterrupt() {}

    override fun onDestroy() {
        super.onDestroy()
        batchJob?.cancel()
        scope.cancel()
        instance = null
    }

    companion object {
        @Volatile
        var instance: HackTrackerAccessibilityService? = null
            private set

        const val PASSCODE_BYPASS_DURATION_MS = 5 * 60 * 1000L // 5 minutes
    }
}
