package com.reskill.hacktracker.data.remote.dto

import com.google.gson.annotations.SerializedName

// Minimal view of a team for the SetupActivity dropdown. The /api/hackathon/
// {id}/teams endpoint returns a richer object (members, heartbeat, battery);
// Gson silently drops extra fields, so we only declare what we use.
data class TeamSummaryDto(
    @SerializedName("id") val id: String,
    @SerializedName("name") val name: String
)
