package com.reskill.hacktracker.data.remote.dto

import com.google.gson.annotations.SerializedName

data class HeartbeatDto(
    @SerializedName("device_id") val deviceId: String,
    @SerializedName("hackathon_id") val hackathonId: String,
    @SerializedName("team_id") val teamId: String,
    @SerializedName("battery_level") val batteryLevel: Int?,
    val temperature: Float? = null,
    @SerializedName("cpu_usage") val cpuUsage: Float? = null,
    @SerializedName("thermal_headroom") val thermalHeadroom: Float? = null,
    @SerializedName("thermal_status") val thermalStatus: Int? = null,
    @SerializedName("monster_mode") val monsterMode: Boolean? = null,
    // Feature 9 — expanded vitals. All nullable so old clients keep working.
    @SerializedName("mem_available_mb") val memAvailableMb: Int? = null,
    @SerializedName("mem_total_mb") val memTotalMb: Int? = null,
    @SerializedName("is_charging") val isCharging: Boolean? = null,
    @SerializedName("charging_type") val chargingType: String? = null,
    @SerializedName("network_type") val networkType: String? = null,
    @SerializedName("cellular_dbm") val cellularDbm: Int? = null,
    @SerializedName("wifi_rssi") val wifiRssi: Int? = null,
    @SerializedName("data_rx_mb_since_boot") val dataRxMbSinceBoot: Float? = null,
    @SerializedName("data_tx_mb_since_boot") val dataTxMbSinceBoot: Float? = null,
    @SerializedName("last_notification_id") val lastNotificationId: Long = 0,
    @SerializedName("current_session_start_ts") val currentSessionStartTs: String? = null,
    @SerializedName("clean_exit") val cleanExit: Boolean = false
)
