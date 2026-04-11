package com.reskill.hacktracker.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "event_batches")
data class EventBatchEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val hackathonId: String,
    val teamId: String,
    val deviceId: String,
    val periodStart: Long,
    val periodEnd: Long,
    val taps: Int = 0,
    val textInputs: Int = 0,
    val scrolls: Int = 0,
    val appSwitches: Int = 0,
    val longPresses: Int = 0,
    val notifications: Int = 0,
    val perAppTaps: String = "{}",
    val perAppScrolls: String = "{}",
    val perAppTextInputs: String = "{}",
    val foregroundApp: String? = null,
    val synced: Boolean = false
)
