package com.reskill.hacktracker.data.remote.dto

import com.google.gson.annotations.SerializedName

data class CameraEventDto(
    @SerializedName("device_id") val deviceId: String,
    @SerializedName("hackathon_id") val hackathonId: String,
    @SerializedName("team_id") val teamId: String,
    @SerializedName("event_time") val eventTime: String,
    @SerializedName("event_type") val eventType: String = "camera_open"
)

data class ClipboardEventDto(
    @SerializedName("device_id") val deviceId: String,
    @SerializedName("hackathon_id") val hackathonId: String,
    @SerializedName("team_id") val teamId: String,
    @SerializedName("event_time") val eventTime: String
)
