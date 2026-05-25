package com.reskill.hacktracker.data.repository

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.util.Log
import com.reskill.hacktracker.data.local.HackTrackerDatabase
import com.reskill.hacktracker.data.local.entity.AppUsageEntity
import com.reskill.hacktracker.data.local.entity.EventBatchEntity
import com.reskill.hacktracker.data.local.entity.SensorAggregateEntity
import com.reskill.hacktracker.data.remote.ApiClient
import com.reskill.hacktracker.data.remote.dto.*
import com.reskill.hacktracker.util.Constants
import com.reskill.hacktracker.util.SessionManager
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.RequestBody.Companion.toRequestBody
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
        keyboardActiveSeconds: Int = 0,
        officeKitSeconds: Int = 0,
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
            keyboardActiveSeconds = keyboardActiveSeconds,
            officeKitSeconds = officeKitSeconds,
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
                        notifications = batch.notifications,
                        keyboardActiveSeconds = batch.keyboardActiveSeconds
                    ),
                    perAppTaps = parseMap(batch.perAppTaps),
                    perAppScrolls = parseMap(batch.perAppScrolls),
                    perAppTextInputs = parseMap(batch.perAppTextInputs),
                    foregroundApp = batch.foregroundApp,
                    officeKitSeconds = batch.officeKitSeconds
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

    data class HeartbeatResult(
        val notifications: List<Triple<Long, String, String>>,
        val currentLight: String?,
        val pendingScreenshotId: Long? = null,
    )

    /**
     * Send heartbeat and return any pending notifications + current venue light.
     */
    suspend fun sendHeartbeatAndGetNotifications(): HeartbeatResult {
        if (!session.isConfigured) return HeartbeatResult(emptyList(), null)
        try {
            val batteryLevel = getBatteryLevel()
            val temperature = getBatteryTemperature()
            val cpuUsage = getCpuUsage()
            val batteryStatus = readBatteryStatus()
            val (memAvailableMb, memTotalMb) = getMemoryMb()
            val networkType = getNetworkType()
            val sessionStart = session.currentSessionStart?.let { isoFormat.format(Date(it)) }
            val dto = HeartbeatDto(
                deviceId = session.deviceId,
                hackathonId = session.hackathonId,
                teamId = session.teamId,
                batteryLevel = batteryLevel,
                temperature = temperature,
                cpuUsage = cpuUsage,
                thermalHeadroom = getThermalHeadroom(),
                thermalStatus = getThermalStatus(),
                monsterMode = getMonsterMode(),
                memAvailableMb = memAvailableMb,
                memTotalMb = memTotalMb,
                isCharging = batteryStatus?.isCharging,
                chargingType = batteryStatus?.chargingType,
                networkType = networkType,
                cellularDbm = getCellularDbm(),
                wifiRssi = getWifiRssi(),
                dataRxMbSinceBoot = getDataRxMb(),
                dataTxMbSinceBoot = getDataTxMb(),
                lastNotificationId = session.lastNotificationId,
                currentSessionStartTs = sessionStart,
                cleanExit = session.cleanExit
            )

            val response = api().sendHeartbeat(dto)
            Log.w("HackTracker", "Heartbeat response: ${response.code()}")
            if (!response.isSuccessful) return HeartbeatResult(emptyList(), null)
            session.lastHeartbeatSentAt = System.currentTimeMillis()

            val responseBody = response.body() ?: return HeartbeatResult(emptyList(), null)
            Log.w("HackTracker", "Heartbeat body keys: ${responseBody.keys}")

            val light = (responseBody["current_light"] as? String)?.lowercase()?.takeIf {
                it == Constants.LIGHT_GREEN || it == Constants.LIGHT_RED
            }

            val notifs = (responseBody["notifications"] as? List<*>) ?: emptyList<Any?>()
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

            val pendingScreenshot = (responseBody["pending_screenshot_id"] as? Number)?.toLong()
            return HeartbeatResult(result, light, pendingScreenshot)
        } catch (e: Exception) {
            Log.w("HackTracker", "Heartbeat error: ${e.message}", e)
            return HeartbeatResult(emptyList(), null)
        }
    }

    suspend fun uploadScreenshot(requestId: Long, pngBytes: ByteArray): Boolean {
        if (!session.isConfigured) {
            Log.w("HackTracker", "uploadScreenshot $requestId: session not configured")
            return false
        }
        return try {
            val imageBody = pngBytes.toRequestBody("image/png".toMediaTypeOrNull())
            val imagePart = okhttp3.MultipartBody.Part.createFormData(
                "image",
                "screenshot-$requestId.png",
                imageBody
            )
            val idBody = requestId.toString().toRequestBody("text/plain".toMediaTypeOrNull())
            val deviceBody = session.deviceId.toRequestBody("text/plain".toMediaTypeOrNull())
            val response = api().uploadScreenshot(imagePart, idBody, deviceBody)
            Log.w(
                "HackTracker",
                "uploadScreenshot $requestId: HTTP ${response.code()} (${pngBytes.size}b)"
            )
            response.isSuccessful
        } catch (e: Exception) {
            Log.w("HackTracker", "Screenshot upload $requestId failed", e)
            false
        }
    }

    suspend fun saveSensorAggregate(entity: SensorAggregateEntity) {
        db.sensorAggregateDao().insert(entity)
    }

    suspend fun syncSensorAggregates() {
        if (!session.isConfigured) return
        val unsynced = db.sensorAggregateDao().getUnsynced()
        if (unsynced.isEmpty()) return

        // Chunked POSTs keep request bodies small if the device was offline
        // for a long stretch.
        for (chunk in unsynced.chunked(60)) {
            try {
                val dto = SensorBatchDto(
                    aggregates = chunk.map { e ->
                        SensorAggregateDto(
                            deviceId = e.deviceId,
                            hackathonId = e.hackathonId,
                            teamId = e.teamId,
                            periodStart = isoFormat.format(Date(e.periodStart)),
                            periodEnd = isoFormat.format(Date(e.periodEnd)),
                            accelMean = e.accelMean,
                            accelStddev = e.accelStddev,
                            accelPeak = e.accelPeak,
                            gyroMean = e.gyroMean,
                            gyroStddev = e.gyroStddev,
                            gyroPeak = e.gyroPeak,
                            magnetoMean = e.magnetoMean,
                            luxMean = e.luxMean,
                            proximityNearPct = e.proximityNearPct,
                            stepsDelta = e.stepsDelta
                        )
                    }
                )
                val response = api().sendSensorBatch(dto)
                if (response.isSuccessful) {
                    for (row in chunk) db.sensorAggregateDao().markSynced(row.id)
                } else {
                    break
                }
            } catch (_: Exception) {
                break
            }
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

    suspend fun syncCrashLogs() {
        if (!session.isConfigured) return
        val unsynced = db.crashLogDao().getUnsynced()
        if (unsynced.isEmpty()) return

        for (chunk in unsynced.chunked(50)) {
            try {
                val dto = CrashLogBatchDto(
                    crashes = chunk.map { row ->
                        CrashLogDto(
                            deviceId = row.deviceId,
                            hackathonId = row.hackathonId,
                            teamId = row.teamId,
                            occurredAt = isoFormat.format(Date(row.occurredAt)),
                            threadName = row.threadName,
                            stacktrace = row.stacktrace,
                            foregroundApp = row.foregroundApp,
                            reason = row.reason
                        )
                    }
                )
                val response = api().sendCrashLogs(dto)
                if (response.isSuccessful) {
                    for (row in chunk) db.crashLogDao().markSynced(row.id)
                } else {
                    break
                }
            } catch (_: Exception) {
                break
            }
        }
    }

    /**
     * Queue a tamper event locally. Synced in batches by [syncTamperEvents] on
     * the foreground service's 60s cadence. Detail is stored as a JSON object
     * string and re-expanded to a map on the wire so the server keeps it as jsonb.
     */
    suspend fun logTamperEvent(type: String, detail: Map<String, Any?> = emptyMap()) {
        if (!session.isConfigured) return
        try {
            val entity = com.reskill.hacktracker.data.local.entity.TamperEventEntity(
                hackathonId = session.hackathonId,
                teamId = session.teamId,
                deviceId = session.deviceId,
                type = type,
                detailJson = com.google.gson.Gson().toJson(detail),
                occurredAt = System.currentTimeMillis()
            )
            db.tamperEventDao().insert(entity)
            Log.w("HackTracker", "Tamper logged: type=$type detail=$detail")
        } catch (e: Exception) {
            Log.w("HackTracker", "logTamperEvent failed", e)
        }
    }

    suspend fun syncTamperEvents() {
        if (!session.isConfigured) return
        val unsynced = db.tamperEventDao().getUnsynced()
        if (unsynced.isEmpty()) return

        val gson = com.google.gson.Gson()
        val mapType = object : com.google.gson.reflect.TypeToken<Map<String, Any?>>() {}.type
        fun parseDetail(json: String): Map<String, Any?> = try {
            gson.fromJson(json, mapType) ?: emptyMap()
        } catch (_: Exception) { emptyMap() }

        for (chunk in unsynced.chunked(50)) {
            try {
                val dto = TamperBatchDto(
                    events = chunk.map { row ->
                        TamperEventDto(
                            deviceId = row.deviceId,
                            hackathonId = row.hackathonId,
                            teamId = row.teamId,
                            type = row.type,
                            detail = parseDetail(row.detailJson),
                            occurredAt = isoFormat.format(Date(row.occurredAt))
                        )
                    }
                )
                val response = api().sendTamperEvents(dto)
                if (response.isSuccessful) {
                    for (row in chunk) db.tamperEventDao().markSynced(row.id)
                } else {
                    break
                }
            } catch (_: Exception) {
                break
            }
        }
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

    // PowerManager.getThermalHeadroom (API 30+): normalized 0..1+, where 1.0 is
    // the throttling threshold. Higher = hotter = more intense workload. Returns
    // NaN when the platform has insufficient data or is polled too frequently.
    private fun getThermalHeadroom(): Float? {
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.R) return null
        return try {
            val pm = context.getSystemService(Context.POWER_SERVICE) as? android.os.PowerManager
                ?: return null
            val h = pm.getThermalHeadroom(Constants.THERMAL_HEADROOM_FORECAST_SECONDS)
            if (h.isNaN()) null else h
        } catch (_: Exception) {
            null
        }
    }

    // PowerManager.getCurrentThermalStatus (API 29+): 0=NONE .. 7=SHUTDOWN.
    private fun getThermalStatus(): Int? {
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.Q) return null
        return try {
            val pm = context.getSystemService(Context.POWER_SERVICE) as? android.os.PowerManager
                ?: return null
            pm.currentThermalStatus
        } catch (_: Exception) {
            null
        }
    }

    // iQOO game/performance mode. "Monster Mode" itself is a per-game Game Cube
    // toggle with no global key, so we read the real game/performance-mode flags
    // and treat any value > 0 as enabled. Sent on the wire as `monster_mode` and
    // surfaced as "Performance mode minutes". Returns null when nothing is
    // readable so the server skips it cleanly.
    private fun getMonsterMode(): Boolean? {
        return try {
            val resolver = context.contentResolver
            for (key in Constants.PERFORMANCE_MODE_SETTING_KEYS) {
                val sys = android.provider.Settings.System.getInt(resolver, key, -1)
                if (sys >= 0) return sys > 0
                val global = android.provider.Settings.Global.getInt(resolver, key, -1)
                if (global >= 0) return global > 0
            }
            null
        } catch (_: Exception) {
            null
        }
    }

    private data class BatteryStatus(val isCharging: Boolean, val chargingType: String)

    // Reads charging state + source from a single ACTION_BATTERY_CHANGED sticky
    // broadcast. is_charging is true whenever a power source is plugged in
    // (status CHARGING/FULL or a non-zero plug type) so "plug in → true" holds
    // even on the FULL transition.
    private fun readBatteryStatus(): BatteryStatus? {
        return try {
            val filter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
            val batteryStatus = context.registerReceiver(null, filter) ?: return null
            val status = batteryStatus.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
            val plugged = batteryStatus.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0)
            val chargingType = when (plugged) {
                BatteryManager.BATTERY_PLUGGED_AC -> Constants.CHARGING_TYPE_AC
                BatteryManager.BATTERY_PLUGGED_USB -> Constants.CHARGING_TYPE_USB
                BatteryManager.BATTERY_PLUGGED_WIRELESS -> Constants.CHARGING_TYPE_WIRELESS
                else -> Constants.CHARGING_TYPE_NONE
            }
            val isCharging = plugged != 0 ||
                status == BatteryManager.BATTERY_STATUS_CHARGING ||
                status == BatteryManager.BATTERY_STATUS_FULL
            BatteryStatus(isCharging, chargingType)
        } catch (_: Exception) {
            null
        }
    }

    // ActivityManager.MemoryInfo, reported in binary megabytes.
    private fun getMemoryMb(): Pair<Int?, Int?> {
        return try {
            val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
            val memInfo = android.app.ActivityManager.MemoryInfo()
            activityManager.getMemoryInfo(memInfo)
            val available = (memInfo.availMem / Constants.BYTES_PER_MB).toInt()
            val total = (memInfo.totalMem / Constants.BYTES_PER_MB).toInt()
            available to total
        } catch (_: Exception) {
            null to null
        }
    }

    // Active network transport. VPN wins over the underlying transport so a
    // tethered/VPN'd device is flagged distinctly.
    private fun getNetworkType(): String? {
        return try {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? android.net.ConnectivityManager
                ?: return null
            val active = cm.activeNetwork ?: return Constants.NETWORK_TYPE_NONE
            val caps = cm.getNetworkCapabilities(active) ?: return Constants.NETWORK_TYPE_NONE
            when {
                caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_VPN) -> Constants.NETWORK_TYPE_VPN
                caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI) -> Constants.NETWORK_TYPE_WIFI
                caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_CELLULAR) -> Constants.NETWORK_TYPE_CELLULAR
                else -> Constants.NETWORK_TYPE_NONE
            }
        } catch (_: Exception) {
            null
        }
    }

    // TelephonyManager.signalStrength (API 28+). Best-effort: returns null on
    // older platforms, when off-cellular, or when the read is denied.
    private fun getCellularDbm(): Int? {
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.P) return null
        return try {
            val tm = context.getSystemService(Context.TELEPHONY_SERVICE) as? android.telephony.TelephonyManager
                ?: return null
            val dbm = tm.signalStrength?.cellSignalStrengths?.firstOrNull()?.dbm ?: return null
            // Integer.MAX_VALUE is the "unknown" sentinel from CellSignalStrength.
            if (dbm == Int.MAX_VALUE) null else dbm
        } catch (_: Exception) {
            null
        }
    }

    // WifiManager.connectionInfo.rssi (dBm). Deprecated but still the simplest
    // pollable Wi-Fi signal read on this ROM.
    @Suppress("DEPRECATION")
    private fun getWifiRssi(): Int? {
        return try {
            val wm = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? android.net.wifi.WifiManager
                ?: return null
            val rssi = wm.connectionInfo?.rssi ?: return null
            // -127 is WifiInfo.INVALID_RSSI.
            if (rssi == -127) null else rssi
        } catch (_: Exception) {
            null
        }
    }

    private fun getDataRxMb(): Float? {
        return try {
            val bytes = android.net.TrafficStats.getTotalRxBytes()
            if (bytes == android.net.TrafficStats.UNSUPPORTED.toLong()) null
            else bytes.toFloat() / Constants.BYTES_PER_MB
        } catch (_: Exception) {
            null
        }
    }

    private fun getDataTxMb(): Float? {
        return try {
            val bytes = android.net.TrafficStats.getTotalTxBytes()
            if (bytes == android.net.TrafficStats.UNSUPPORTED.toLong()) null
            else bytes.toFloat() / Constants.BYTES_PER_MB
        } catch (_: Exception) {
            null
        }
    }
}
