package com.reskill.hacktracker.util

object Constants {
    const val NOTIFICATION_CHANNEL_ID = "hacktracker_tracking"
    // Bumped to _v2 when the channel gained an explicit sound + vibration.
    // NotificationChannel settings are frozen after first creation, so a new id
    // is the only way the new chime applies to devices that merely update the APK.
    const val NOTIFICATION_CHANNEL_PUSH_ID = "hacktracker_push_v2"
    const val NOTIFICATION_ID = 1001
    const val EVENT_BATCH_INTERVAL_MS = 60_000L   // 60 seconds
    const val USAGE_STATS_INTERVAL_MS = 300_000L  // 5 minutes
    // 2s heartbeat targets sub-5s screenshot pickup. Server throttles
    // device_vitals inserts to ~25s so this faster poll doesn't bloat the
    // vitals timeline. Heartbeat payload itself is tiny (~250 bytes).
    const val HEARTBEAT_INTERVAL_MS = 2_000L      // 2 seconds
    const val SENSOR_WINDOW_MS = 60_000L          // 60 seconds — one aggregate per window
    const val SESSION_GAP_MS = 120_000L           // 120 seconds — gap above this ends a continuous session
    const val CRASH_RECOVERY_THRESHOLD_MS = 300_000L // 5 minutes — heartbeat dead this long + dirty exit ⇒ crashed
    const val PREFS_NAME = "hacktracker_prefs"

    // Crash log reasons
    const val CRASH_REASON_UNCAUGHT = "uncaught_exception"
    const val CRASH_REASON_RECOVERED_DIRTY = "recovered_dirty"

    // Venue light signal (red = visible cue, NOT phone enforcement)
    const val LIGHT_GREEN = "green"
    const val LIGHT_RED = "red"
    const val LIGHT_OVERLAY_HEIGHT_DP = 4

    // Screenshots (Feature 7)
    const val SCREENSHOT_CAPTURE_TIMEOUT_MS = 5_000L
    const val SCREENSHOT_UPLOAD_TIMEOUT_MS = 30_000L

    // Feature 8 — hardware-stress leaderboard telemetry
    // Forecast window passed to PowerManager.getThermalHeadroom().
    const val THERMAL_HEADROOM_FORECAST_SECONDS = 10

    // Feature 9 — expanded device vitals.
    // Byte→MB divisor for memory / TrafficStats readings (binary megabytes).
    const val BYTES_PER_MB = 1024L * 1024L

    // charging_type values reported on the heartbeat.
    const val CHARGING_TYPE_AC = "ac"
    const val CHARGING_TYPE_USB = "usb"
    const val CHARGING_TYPE_WIRELESS = "wireless"
    const val CHARGING_TYPE_NONE = "none"

    // network_type values reported on the heartbeat. VPN takes precedence over
    // the underlying transport when both are present.
    const val NETWORK_TYPE_WIFI = "wifi"
    const val NETWORK_TYPE_CELLULAR = "cellular"
    const val NETWORK_TYPE_VPN = "vpn"
    const val NETWORK_TYPE_NONE = "none"

    // iQOO "Monster Mode" has no global Settings key — it's a per-game toggle in
    // Game Cube. The closest REAL pollable signal on this ROM is the game/
    // performance-mode flags below (confirmed via `adb shell settings list system`).
    // Read in System then Global namespace; any value > 0 counts as "on".
    // Surfaced on the leaderboard as "Performance mode minutes".
    val PERFORMANCE_MODE_SETTING_KEYS = listOf(
        "is_game_mode",
        "game_plus_mode_key",
        "bench_mark_mode",
    )

    // Accessibility className substrings that mark the iQOO Office Kit window.
    // Matched case-insensitively against TYPE_WINDOW_STATE_CHANGED className.
    // `pcsuite` confirmed on this unit (Office Kit → vivo PC Suite,
    // com.vivo.pcsuite.activity.DeviceListActivity). Re-confirm per ROM via:
    //   adb shell "dumpsys activity activities | grep -i resumed"   (Office Kit open)
    val OFFICE_KIT_CLASS_PATTERNS = listOf(
        "pcsuite",        // vivo PC Suite — PC connect / multi-screen
        "remotecontrol",  // vivo Remote Control
        "smartoffice",    // vivo Smart Office — document tools
        "officekit",
        "office_kit",
        "vivo.office",
        "smart_office",
    )

    // Feature 10 — hardened tamper detection.

    // Settings-launcher packages we treat as protected. Stock AOSP + the
    // OriginOS / Funtouch variants we've seen on iQOO and Vivo phones.
    // Anything not in this list (e.g. third-party launchers) won't trigger
    // the passcode gate, but a real attacker can't open the system Settings
    // through them either.
    val SETTINGS_PACKAGES = setOf(
        "com.android.settings",
        "com.iqoo.settings",
        "com.vivo.settings",
        "com.bbk.settings",
        "com.iqoo.secure",
    )

    // tamper_event.type tags. Kept in sync with the dashboard TamperList labels.
    const val TAMPER_SETTINGS_PAGE = "settings_page_open"
    const val TAMPER_ADB_TOGGLED = "adb_toggled"
    const val TAMPER_TIME_DRIFT = "time_drift"
    const val TAMPER_SAFE_MODE = "safe_mode_boot"
    const val TAMPER_PACKAGE_ADDED = "package_added"
    const val TAMPER_PACKAGE_REMOVED = "package_removed"
    const val TAMPER_ACCESSIBILITY_DISABLED = "accessibility_disabled"

    // Wall-clock (System.currentTimeMillis) vs monotonic (elapsedRealtime) deltas
    // are compared each batch flush; divergence above this is logged as time_drift.
    const val TIME_DRIFT_THRESHOLD_MS = 5_000L

    // Augments className matching on the Settings package: matched (case-insensitive)
    // against the page heading text so OEM-renamed (OriginOS) activities still trip
    // the passcode gate. `^apps$` only matches a heading that is exactly "Apps".
    val SETTINGS_HEADING_REGEX = Regex(
        "accessibility|device admin|special app access|usage access|installed apps|^apps$|force stop",
        RegexOption.IGNORE_CASE
    )

    // Cap on nodes walked when locating the Settings page heading — keeps the
    // tree scan off the main thread budget on deep layouts.
    const val HEADING_SCAN_NODE_LIMIT = 200

    // Packages whose install/removal is NOT flagged as tamper. Empty → every
    // package change during the hackathon is treated as unexpected and logged.
    // (A per-hackathon config push would seed this; none exists yet, so it's a
    // compile-time list. Our own package is always ignored separately.)
    val PACKAGE_CHANGE_ALLOW_LIST = emptyList<String>()
}
