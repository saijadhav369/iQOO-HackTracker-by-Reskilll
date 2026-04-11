package com.reskill.hacktracker.data.remote.dto

import com.google.gson.annotations.SerializedName

data class DeviceRegistrationDto(
    @SerializedName("device_id") val deviceId: String,
    @SerializedName("hackathon_id") val hackathonId: String,
    @SerializedName("team_id") val teamId: String,
    @SerializedName("team_name") val teamName: String
)
