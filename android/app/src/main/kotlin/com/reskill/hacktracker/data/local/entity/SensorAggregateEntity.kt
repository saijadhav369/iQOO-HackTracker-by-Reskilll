package com.reskill.hacktracker.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "sensor_aggregates")
data class SensorAggregateEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val hackathonId: String,
    val teamId: String,
    val deviceId: String,
    val periodStart: Long,
    val periodEnd: Long,
    val accelMean: Float? = null,
    val accelStddev: Float? = null,
    val accelPeak: Float? = null,
    val gyroMean: Float? = null,
    val gyroStddev: Float? = null,
    val gyroPeak: Float? = null,
    val magnetoMean: Float? = null,
    val luxMean: Float? = null,
    val proximityNearPct: Float? = null,
    val stepsDelta: Int? = null,
    val synced: Boolean = false
)
