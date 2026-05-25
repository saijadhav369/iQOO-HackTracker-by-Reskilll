package com.reskill.hacktracker.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "tamper_events")
data class TamperEventEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val hackathonId: String,
    val teamId: String,
    val deviceId: String,
    val type: String,
    // JSON object string; parsed back to a map when posted so the server stores
    // it as jsonb. Empty object "{}" when there's no per-type detail.
    val detailJson: String = "{}",
    val occurredAt: Long,
    val synced: Boolean = false
)
