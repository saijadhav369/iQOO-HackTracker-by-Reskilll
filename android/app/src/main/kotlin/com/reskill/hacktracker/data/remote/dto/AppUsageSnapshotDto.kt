package com.reskill.hacktracker.data.remote.dto

import com.google.gson.annotations.SerializedName

data class AppUsageSnapshotDto(
    @SerializedName("device_id") val deviceId: String,
    @SerializedName("hackathon_id") val hackathonId: String,
    @SerializedName("team_id") val teamId: String,
    @SerializedName("snapshot_time") val snapshotTime: String,
    val apps: List<AppEntry>
)

data class AppEntry(
    @SerializedName("package") val packageName: String,
    val label: String?,
    @SerializedName("foreground_minutes") val foregroundMinutes: Float,
    @SerializedName("open_count") val openCount: Int
)
