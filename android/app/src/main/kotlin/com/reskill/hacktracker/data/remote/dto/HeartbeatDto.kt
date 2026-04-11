package com.reskill.hacktracker.data.remote.dto

import com.google.gson.annotations.SerializedName

data class HeartbeatDto(
    @SerializedName("device_id") val deviceId: String,
    @SerializedName("hackathon_id") val hackathonId: String,
    @SerializedName("team_id") val teamId: String,
    @SerializedName("battery_level") val batteryLevel: Int?,
    val temperature: Float? = null,
    @SerializedName("cpu_usage") val cpuUsage: Float? = null,
    @SerializedName("last_notification_id") val lastNotificationId: Long = 0
)
