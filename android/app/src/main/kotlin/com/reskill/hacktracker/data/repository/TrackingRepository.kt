package com.reskill.hacktracker.data.repository

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.util.Log
import com.reskill.hacktracker.data.local.HackTrackerDatabase
import com.reskill.hacktracker.data.local.entity.AppUsageEntity
import com.reskill.hacktracker.data.local.entity.EventBatchEntity
import com.reskill.hacktracker.data.remote.ApiClient
import com.reskill.hacktracker.data.remote.dto.*
import com.reskill.hacktracker.util.SessionManager
import java.text.SimpleDateFormat
import java.util.*

class TrackingRepository(private val context: Context) {
    private val db = HackTrackerDatabase.getInstance(context)
    private val session = SessionManager(context)
    private val isoFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }

    private fun api() = ApiClient.getService(session.apiUrl)

    suspend fun registerDevice(): Boolean {
        if (!session.isConfigured) return false
        return try {
            val response = api().registerDevice(
                DeviceRegistrationDto(
                    deviceId = session.deviceId,
                    hackathonId = session.hackathonId,
                    teamId = session.teamId,
                    teamName = session.teamName
                )
            )
            response.isSuccessful
        } catch (_: Exception) {
            false
        }
    }

    suspend fun saveEventBatch(
        taps: Int,
        textInputs: Int,
        scrolls: Int,
        appSwitches: Int,
        longPresses: Int = 0,
        notifications: Int = 0,
        perAppTaps: Map<String, Int>,
        perAppScrolls: Map<String, Int> = emptyMap(),
        perAppTextInputs: Map<String, Int> = emptyMap(),
        foregroundApp: String?,
        periodStart: Long,
        periodEnd: Long
    ) {
        val gson = com.google.gson.Gson()
        val entity = EventBatchEntity(
            hackathonId = session.hackathonId,
            teamId = session.teamId,
            deviceId = session.deviceId,
            periodStart = periodStart,
            periodEnd = periodEnd,
            taps = taps,
            textInputs = textInputs,
            scrolls = scrolls,
            appSwitches = appSwitches,
            longPresses = longPresses,
            notifications = notifications,
            perAppTaps = gson.toJson(perAppTaps),
            perAppScrolls = gson.toJson(perAppScrolls),
            perAppTextInputs = gson.toJson(perAppTextInputs),
            foregroundApp = foregroundApp
        )
        db.eventBatchDao().insert(entity)
    }

    suspend fun syncEventBatches() {
        if (!session.isConfigured) return
        val unsynced = db.eventBatchDao().getUnsynced()

        for (batch in unsynced) {
            try {
                val gson = com.google.gson.Gson()
                val mapType = object : com.google.gson.reflect.TypeToken<Map<String, Int>>() {}.type
                fun parseMap(json: String): Map<String, Int> = try {
                    gson.fromJson(json, mapType) ?: emptyMap()
                } catch (_: Exception) { emptyMap() }

                val dto = EventBatchDto(
                    deviceId = batch.deviceId,
                    hackathonId = batch.hackathonId,
                    teamId = batch.teamId,
                    periodStart = isoFormat.format(Date(batch.periodStart)),
                    periodEnd = isoFormat.format(Date(batch.periodEnd)),
                    events = EventCounts(
                        taps = batch.taps,
                        textInputs = batch.textInputs,
                        scrolls = batch.scrolls,
                        appSwitches = batch.appSwitches,
                        longPresses = batch.longPresses,
                        notifications = batch.notifications
                    ),
                    perAppTaps = parseMap(batch.perAppTaps),
                    perAppScrolls = parseMap(batch.perAppScrolls),
                    perAppTextInputs = parseMap(batch.perAppTextInputs),
                    foregroundApp = batch.foregroundApp
                )

                val response = api().sendEventBatch(dto)
                if (response.isSuccessful) {
                    db.eventBatchDao().markSynced(batch.id)
                }
            } catch (_: Exception) {
                // Will retry on next sync cycle
                break
            }
        }
    }

    suspend fun saveAppUsage(entries: List<AppUsageEntity>) {
        if (entries.isNotEmpty()) {
            db.appUsageDao().insertAll(entries)
        }
    }

    suspend fun syncAppUsage() {
        if (!session.isConfigured) return
        val unsynced = db.appUsageDao().getUnsynced()
        if (unsynced.isEmpty()) return

        // Group by snapshot time
        val grouped = unsynced.groupBy { it.snapshotTime }

        for ((snapshotTime, entries) in grouped) {
            try {
                val dto = AppUsageSnapshotDto(
                    deviceId = session.deviceId,
                    hackathonId = session.hackathonId,
                    teamId = session.teamId,
                    snapshotTime = isoFormat.format(Date(snapshotTime)),
                    apps = entries.map { e ->
                        AppEntry(
                            packageName = e.appPackage,
                            label = e.appLabel,
                            foregroundMinutes = e.foregroundMinutes,
                            openCount = e.openCount
                        )
                    }
                )

                val response = api().sendUsageSnapshot(dto)
                if (response.isSuccessful) {
                    db.appUsageDao().markSynced(entries.map { it.id })
                }
            } catch (_: Exception) {
                break
            }
        }
    }

    suspend fun sendHeartbeat() {
        if (!session.isConfigured) return
        try {
            val batteryLevel = getBatteryLevel()
            api().sendHeartbeat(
                HeartbeatDto(
                    deviceId = session.deviceId,
                    hackathonId = session.hackathonId,
                    teamId = session.teamId,
                    batteryLevel = batteryLevel
                )
            )
        } catch (_: Exception) {}
    }

    /**
     * Send heartbeat and return any pending notifications as List<Triple<id, title, message>>
     */
    suspend fun sendHeartbeatAndGetNotifications(): List<Triple<Long, String, String>> {
        if (!session.isConfigured) return emptyList()
        try {
            val batteryLevel = getBatteryLevel()
            val temperature = getBatteryTemperature()
            val cpuUsage = getCpuUsage()
            val dto = HeartbeatDto(
                deviceId = session.deviceId,
                hackathonId = session.hackathonId,
                teamId = session.teamId,
                batteryLevel = batteryLevel,
                temperature = temperature,
                cpuUsage = cpuUsage,
                lastNotificationId = session.lastNotificationId
            )

            val response = api().sendHeartbeat(dto)
            Log.w("HackTracker", "Heartbeat response: ${response.code()}")
            if (!response.isSuccessful) return emptyList()

            val responseBody = response.body() ?: return emptyList()
            Log.w("HackTracker", "Heartbeat body keys: ${responseBody.keys}")
            val notifs = (responseBody["notifications"] as? List<*>) ?: return emptyList()
            Log.w("HackTracker", "Notifications count: ${notifs.size}")

            val result = mutableListOf<Triple<Long, String, String>>()
            for (item in notifs) {
                val map = item as? Map<*, *> ?: continue
                val id = (map["id"] as? Number)?.toLong() ?: continue
                val title = map["title"] as? String ?: continue
                val message = map["message"] as? String ?: continue
                Log.w("HackTracker", "Notif: id=$id title=$title")
                result.add(Triple(id, title, message))
                if (id > session.lastNotificationId) {
                    session.lastNotificationId = id
                }
            }
            return result
        } catch (e: Exception) {
            Log.w("HackTracker", "Heartbeat error: ${e.message}", e)
            return emptyList()
        }
    }

    suspend fun sendCameraEvent() {
        if (!session.isConfigured) return
        try {
            api().sendCameraEvent(
                CameraEventDto(
                    deviceId = session.deviceId,
                    hackathonId = session.hackathonId,
                    teamId = session.teamId,
                    eventTime = isoFormat.format(Date())
                )
            )
        } catch (_: Exception) {}
    }

    suspend fun sendClipboardEvent() {
        if (!session.isConfigured) return
        try {
            api().sendClipboardEvent(
                ClipboardEventDto(
                    deviceId = session.deviceId,
                    hackathonId = session.hackathonId,
                    teamId = session.teamId,
                    eventTime = isoFormat.format(Date())
                )
            )
        } catch (_: Exception) {}
    }

    private fun getBatteryLevel(): Int? {
        return try {
            val filter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
            val batteryStatus = context.registerReceiver(null, filter)
            val level = batteryStatus?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
            val scale = batteryStatus?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
            if (level >= 0 && scale > 0) (level * 100) / scale else null
        } catch (_: Exception) {
            null
        }
    }

    private fun getBatteryTemperature(): Float? {
        return try {
            val filter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
            val batteryStatus = context.registerReceiver(null, filter)
            val temp = batteryStatus?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, -1) ?: -1
            if (temp > 0) temp / 10f else null // Android reports in tenths of °C
        } catch (_: Exception) {
            null
        }
    }

    private fun getCpuUsage(): Float? {
        // Actually returns device RAM usage % (CPU is blocked by Android for non-system apps)
        return try {
            val activityManager = context.getSystemService(android.content.Context.ACTIVITY_SERVICE) as android.app.ActivityManager
            val memInfo = android.app.ActivityManager.MemoryInfo()
            activityManager.getMemoryInfo(memInfo)
            val usedMem = memInfo.totalMem - memInfo.availMem
            (usedMem.toFloat() / memInfo.totalMem * 100f)
        } catch (_: Exception) {
            null
        }
    }
}
