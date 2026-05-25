package com.reskill.hacktracker.data.remote.dto

import com.google.gson.annotations.SerializedName

data class CrashLogDto(
    @SerializedName("device_id") val deviceId: String,
    @SerializedName("hackathon_id") val hackathonId: String,
    @SerializedName("team_id") val teamId: String,
    @SerializedName("occurred_at") val occurredAt: String,
    @SerializedName("thread_name") val threadName: String? = null,
    val stacktrace: String? = null,
    @SerializedName("foreground_app") val foregroundApp: String? = null,
    val reason: String? = null
)

data class CrashLogBatchDto(
    val crashes: List<CrashLogDto>
)
