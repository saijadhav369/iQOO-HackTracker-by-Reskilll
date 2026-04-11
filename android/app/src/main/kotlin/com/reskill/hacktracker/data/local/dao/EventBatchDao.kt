package com.reskill.hacktracker.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import com.reskill.hacktracker.data.local.entity.EventBatchEntity

@Dao
interface EventBatchDao {
    @Insert
    suspend fun insert(batch: EventBatchEntity): Long

    @Query("SELECT * FROM event_batches WHERE synced = 0 ORDER BY periodStart ASC")
    suspend fun getUnsynced(): List<EventBatchEntity>

    @Query("UPDATE event_batches SET synced = 1 WHERE id = :id")
    suspend fun markSynced(id: Long)

    @Query("SELECT COUNT(*) FROM event_batches")
    suspend fun count(): Int

    @Query("DELETE FROM event_batches WHERE synced = 1")
    suspend fun deleteSynced()
}
