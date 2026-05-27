package com.reskill.hacktracker.data.remote.dto

import com.google.gson.annotations.SerializedName

data class DeviceRegistrationDto(
    @SerializedName("device_id") val deviceId: String,
    @SerializedName("hackathon_id") val hackathonId: String,
    @SerializedName("team_id") val teamId: String,
    @SerializedName("team_name") val teamName: String,
    // Nullable: when omitted the server auto-assigns the lowest free slot for
    // the team. Set explicitly only when a participant manually picks a slot.
    @SerializedName("member_slot") val memberSlot: Int?,
    @SerializedName("member_name") val memberName: String
)
