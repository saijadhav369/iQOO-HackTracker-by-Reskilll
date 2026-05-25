package com.reskill.hacktracker.data.remote.dto

import com.google.gson.annotations.SerializedName

data class SensorAggregateDto(
    @SerializedName("device_id") val deviceId: String,
    @SerializedName("hackathon_id") val hackathonId: String,
    @SerializedName("team_id") val teamId: String,
    @SerializedName("period_start") val periodStart: String,
    @SerializedName("period_end") val periodEnd: String,
    @SerializedName("accel_mean") val accelMean: Float?,
    @SerializedName("accel_stddev") val accelStddev: Float?,
    @SerializedName("accel_peak") val accelPeak: Float?,
    @SerializedName("gyro_mean") val gyroMean: Float?,
    @SerializedName("gyro_stddev") val gyroStddev: Float?,
    @SerializedName("gyro_peak") val gyroPeak: Float?,
    @SerializedName("magneto_mean") val magnetoMean: Float?,
    @SerializedName("lux_mean") val luxMean: Float?,
    @SerializedName("proximity_near_pct") val proximityNearPct: Float?,
    @SerializedName("steps_delta") val stepsDelta: Int?
)

data class SensorBatchDto(
    val aggregates: List<SensorAggregateDto>
)
