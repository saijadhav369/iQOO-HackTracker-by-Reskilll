package com.reskill.hacktracker.services

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.os.Build
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.reskill.hacktracker.data.repository.TrackingRepository
import com.reskill.hacktracker.ui.PasscodeActivity
import com.reskill.hacktracker.util.Constants
import com.reskill.hacktracker.util.SessionManager
import kotlinx.coroutines.*
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong

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

    // Cumulative ms the IME window has been open during this batch period.
    private val keyboardActiveMs = AtomicLong(0L)

    // Timestamp when the IME window opened. 0L means closed.
    @Volatile
    private var imeOpenSince: Long = 0L

    // Cumulative ms the iQOO Office Kit window has been foregrounded this period.
    private val officeKitActiveMs = AtomicLong(0L)

    // Timestamp when the Office Kit window came to front. 0L means not in front.
    @Volatile
    private var officeKitWindowSince: Long = 0L

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

                // IME open/close tracking. Any "inputmethod" package showing means
                // the keyboard window is up. The next non-IME window state change
                // closes the window and flushes elapsed time into the counter.
                // System UI transitions (notifications shade, etc.) are ignored
                // so they don't terminate an active typing window.
                val isIme = packageName.contains("inputmethod", ignoreCase = true)
                val isSystemUi = packageName == "com.android.systemui"
                val now = System.currentTimeMillis()
                if (isIme) {
                    if (imeOpenSince == 0L) imeOpenSince = now
                } else if (!isSystemUi && imeOpenSince > 0L) {
                    keyboardActiveMs.addAndGet(now - imeOpenSince)
                    imeOpenSince = 0L
                }

                // Office Kit dwell tracking — same open/close pattern as the IME.
                // Transient IME / SystemUI windows don't end an Office Kit session.
                val isOfficeKit = !isIme && !isSystemUi &&
                    Constants.OFFICE_KIT_CLASS_PATTERNS.any {
                        className.contains(it, ignoreCase = true)
                    }
                if (isOfficeKit) {
                    if (officeKitWindowSince == 0L) officeKitWindowSince = now
                } else if (!isIme && !isSystemUi && officeKitWindowSince > 0L) {
                    officeKitActiveMs.addAndGet(now - officeKitWindowSince)
                    officeKitWindowSince = 0L
                }

                // Detect app switch — ignore keyboards and system UI
                val isIgnored = isIme || isSystemUi

                if (!isIgnored && packageName != currentForegroundApp) {
                    lastForegroundApp = currentForegroundApp
                    currentForegroundApp = packageName
                    session.lastForegroundApp = packageName
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
                    val classMatch = lowerClass.contains("accessibility") ||
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

                    // Heading-text fallback catches OEM-renamed (OriginOS)
                    // activities whose className no longer contains the keywords
                    // above — match the visible page heading instead.
                    val heading = if (!classMatch) findSettingsHeading(event.source) else null
                    val headingMatch = heading != null &&
                        Constants.SETTINGS_HEADING_REGEX.containsMatchIn(heading)

                    if (classMatch || headingMatch) {
                        Log.w("HackTracker", "BLOCKED! className=$className heading=$heading")
                        showPasscodeChallenge()
                        scope.launch {
                            try {
                                repository.logTamperEvent(
                                    Constants.TAMPER_SETTINGS_PAGE,
                                    mapOf(
                                        "className" to className,
                                        "heading" to heading,
                                        "matchedBy" to if (classMatch) "class" else "heading"
                                    )
                                )
                            } catch (_: Exception) {}
                        }
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

        // Keyboard active time: snapshot accumulated ms + any ongoing IME-open
        // delta. If IME is still open across the flush boundary, restart its
        // stamp at `now` so the next period continues counting cleanly.
        var keyboardMs = keyboardActiveMs.getAndSet(0L)
        if (imeOpenSince > 0L) {
            keyboardMs += (now - imeOpenSince)
            imeOpenSince = now
        }
        val keyboardSeconds = (keyboardMs / 1000L).toInt()

        // Office Kit dwell: same snapshot logic. If still in the Office Kit
        // window across the flush boundary, restart its stamp at `now`.
        var officeKitMs = officeKitActiveMs.getAndSet(0L)
        if (officeKitWindowSince > 0L) {
            officeKitMs += (now - officeKitWindowSince)
            officeKitWindowSince = now
        }
        val officeKitSeconds = (officeKitMs / 1000L).toInt()

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
        if (taps > 0 || texts > 0 || scrolls > 0 || switches > 0 || notifications > 0 || keyboardSeconds > 0 || officeKitSeconds > 0) {
            repository.saveEventBatch(
                taps = taps,
                textInputs = texts,
                scrolls = scrolls,
                appSwitches = switches,
                longPresses = longPresses,
                notifications = notifications,
                keyboardActiveSeconds = keyboardSeconds,
                officeKitSeconds = officeKitSeconds,
                perAppTaps = appTaps,
                perAppScrolls = appScrolls,
                perAppTextInputs = appTexts,
                foregroundApp = currentForegroundApp,
                periodStart = start,
                periodEnd = now
            )
        }
    }

    /**
     * Find the page heading of the current Settings screen by walking the node
     * tree (BFS, capped). Prefers an explicit heading node (API 28+); falls back
     * to the longest text label near the top of the window. Used to recognise
     * dangerous pages whose className was renamed by the OEM ROM.
     */
    private fun findSettingsHeading(source: AccessibilityNodeInfo?): String? {
        val root = source ?: rootInActiveWindow ?: return null
        var headingText: String? = null
        var longest: String? = null
        val queue = ArrayDeque<AccessibilityNodeInfo>()
        queue.add(root)
        var visited = 0
        while (queue.isNotEmpty() && visited < Constants.HEADING_SCAN_NODE_LIMIT) {
            val node = queue.removeFirst()
            visited++
            val text = node.text?.toString()?.trim()
            if (!text.isNullOrEmpty()) {
                val isHeadingNode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && node.isHeading
                if (isHeadingNode && headingText == null) headingText = text
                if (longest == null || text.length > longest!!.length) longest = text
            }
            for (i in 0 until node.childCount) {
                node.getChild(i)?.let { queue.add(it) }
            }
        }
        return headingText ?: longest
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
