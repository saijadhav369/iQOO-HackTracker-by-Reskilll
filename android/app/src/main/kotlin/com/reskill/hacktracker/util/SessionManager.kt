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

    val isConfigured: Boolean
        get() = hackathonId.isNotBlank() && teamId.isNotBlank() && apiUrl.isNotBlank()
}
