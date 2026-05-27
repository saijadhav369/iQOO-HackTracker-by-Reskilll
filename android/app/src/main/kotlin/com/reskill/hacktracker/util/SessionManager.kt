package com.reskill.hacktracker.util

import android.content.Context
import android.provider.Settings

class SessionManager(context: Context) {
    private val prefs = context.getSharedPreferences(Constants.PREFS_NAME, Context.MODE_PRIVATE)
    private val appContext = context.applicationContext

    var apiUrl: String
        get() = prefs.getString("api_url", "") ?: ""
        set(value) = prefs.edit().putString("api_url", value).apply()

    var hackathonId: String
        get() = prefs.getString("hackathon_id", "") ?: ""
        set(value) = prefs.edit().putString("hackathon_id", value).apply()

    var teamId: String
        get() = prefs.getString("team_id", "") ?: ""
        set(value) = prefs.edit().putString("team_id", value).apply()

    var teamName: String
        get() = prefs.getString("team_name", "") ?: ""
        set(value) = prefs.edit().putString("team_name", value).apply()

    /**
     * Display ordinal (1, 2, 3 ...) for the participant on this phone within
     * the team. Default 0 = "not yet assigned" — the server picks the lowest
     * free slot on register and the response slot is written back here. Once
     * set the value is persistent across the app's lifetime so subsequent
     * register calls keep the same slot.
     */
    var memberSlot: Int
        get() = prefs.getInt("member_slot", 0)
        set(value) = prefs.edit().putInt("member_slot", value).apply()

    /** Free-form participant name. Shown on the dashboard as "Member {slot}: {name}". */
    var memberName: String
        get() = prefs.getString("member_name", "") ?: ""
        set(value) = prefs.edit().putString("member_name", value).apply()

    val deviceId: String
        get() {
            val stored = prefs.getString("device_id", null)
            if (stored != null) return stored
            val id = Settings.Secure.getString(appContext.contentResolver, Settings.Secure.ANDROID_ID)
                ?: "unknown_${System.currentTimeMillis()}"
            prefs.edit().putString("device_id", id).apply()
            return id
        }

    var isTracking: Boolean
        get() = prefs.getBoolean("is_tracking", false)
        set(value) = prefs.edit().putBoolean("is_tracking", value).apply()

    var lastNotificationId: Long
        get() = prefs.getLong("last_notification_id", 0)
        set(value) = prefs.edit().putLong("last_notification_id", value).apply()

    /** Venue signal received from the server — "green" or "red". Default green. */
    var currentLight: String
        get() = prefs.getString("current_light", Constants.LIGHT_GREEN) ?: Constants.LIGHT_GREEN
        set(value) = prefs.edit().putString("current_light", value).apply()

    /** Start of the currently-open screen-on session in epoch millis, or null if no session. */
    var currentSessionStart: Long?
        get() {
            val v = prefs.getLong("current_session_start", 0L)
            return if (v > 0L) v else null
        }
        set(value) {
            if (value == null) prefs.edit().remove("current_session_start").apply()
            else prefs.edit().putLong("current_session_start", value).apply()
        }

    /**
     * Set to true on graceful shutdown signals (passcode-authorised stop, ACTION_SHUTDOWN,
     * ACTION_REBOOT, ACTION_BATTERY_LOW). Set to false when the foreground service starts
     * a new run. Reads as `false` if the process died without flipping the flag — that's
     * how the server distinguishes a crash from a clean offline.
     */
    var cleanExit: Boolean
        get() = prefs.getBoolean("clean_exit", true)
        set(value) = prefs.edit().putBoolean("clean_exit", value).apply()

    /** Epoch millis of the last successful heartbeat send. 0 if never. */
    var lastHeartbeatSentAt: Long
        get() = prefs.getLong("last_heartbeat_sent_at", 0L)
        set(value) = prefs.edit().putLong("last_heartbeat_sent_at", value).apply()

    /** Foreground app package at the time of the last accessibility event, or null. */
    var lastForegroundApp: String?
        get() = prefs.getString("last_foreground_app", null)
        set(value) {
            if (value == null) prefs.edit().remove("last_foreground_app").apply()
            else prefs.edit().putString("last_foreground_app", value).apply()
        }

    /**
     * Set true by [com.reskill.hacktracker.HackTrackerApp] whenever the process
     * starts while the device is booted into Safe Mode (third-party services,
     * including ours, are disabled there). PasscodeActivity refuses to unlock
     * while this is set; a normal reboot clears it (onCreate sets it to the live
     * PackageManager.isSafeMode reading).
     */
    var bootSafeMode: Boolean
        get() = prefs.getBoolean("boot_safe_mode", false)
        set(value) = prefs.edit().putBoolean("boot_safe_mode", value).apply()

    val isConfigured: Boolean
        get() = hackathonId.isNotBlank() && teamId.isNotBlank() && apiUrl.isNotBlank()
            && memberName.isNotBlank()
}
