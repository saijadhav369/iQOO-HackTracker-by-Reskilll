package com.reskill.hacktracker.data.remote.dto

import com.google.gson.annotations.SerializedName

data class EventBatchDto(
    @SerializedName("device_id") val deviceId: String,
    @SerializedName("hackathon_id") val hackathonId: String,
    @SerializedName("team_id") val teamId: String,
    @SerializedName("period_start") val periodStart: String,
    @SerializedName("period_end") val periodEnd: String,
    val events: EventCounts,
    @SerializedName("per_app_taps") val perAppTaps: Map<String, Int>?,
    @SerializedName("per_app_scrolls") val perAppScrolls: Map<String, Int>?,
    @SerializedName("per_app_text_inputs") val perAppTextInputs: Map<String, Int>?,
    @SerializedName("foreground_app") val foregroundApp: String?
)

data class EventCounts(
    val taps: Int,
    @SerializedName("text_inputs") val textInputs: Int,
    val scrolls: Int,
    @SerializedName("app_switches") val appSwitches: Int,
    @SerializedName("long_presses") val longPresses: Int = 0,
    val notifications: Int = 0
)
