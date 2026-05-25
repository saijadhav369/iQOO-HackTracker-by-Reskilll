package com.reskill.hacktracker.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "crash_logs")
data class CrashLogEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val hackathonId: String,
    val teamId: String,
    val deviceId: String,
    val occurredAt: Long,
    val threadName: String? = null,
    val stacktrace: String? = null,
    val foregroundApp: String? = null,
    val reason: String? = null,
    val synced: Boolean = false
)
