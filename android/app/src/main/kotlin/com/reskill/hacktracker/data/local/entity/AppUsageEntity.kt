package com.reskill.hacktracker.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "app_usage")
data class AppUsageEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val hackathonId: String,
    val teamId: String,
    val snapshotTime: Long,  // epoch millis
    val appPackage: String,
    val appLabel: String? = null,
    val foregroundMinutes: Float = 0f,
    val openCount: Int = 0,
    val synced: Boolean = false
)
