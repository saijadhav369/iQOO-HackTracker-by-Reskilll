package com.reskill.hacktracker.data.remote.dto

import com.google.gson.annotations.SerializedName

data class TamperEventDto(
    @SerializedName("device_id") val deviceId: String,
    @SerializedName("hackathon_id") val hackathonId: String,
    @SerializedName("team_id") val teamId: String,
    val type: String,
    val detail: Map<String, Any?>?,
    @SerializedName("occurred_at") val occurredAt: String
)

data class TamperBatchDto(
    val events: List<TamperEventDto>
)
