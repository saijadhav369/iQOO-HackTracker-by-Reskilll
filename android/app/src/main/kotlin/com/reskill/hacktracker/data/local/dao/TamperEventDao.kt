package com.reskill.hacktracker.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import com.reskill.hacktracker.data.local.entity.TamperEventEntity

@Dao
interface TamperEventDao {
    @Insert
    suspend fun insert(entity: TamperEventEntity): Long

    // Synchronous insert for the safe-mode path: detected in Application.onCreate
    // where there's no coroutine scope and our services are disabled anyway.
    @Insert
    fun insertBlocking(entity: TamperEventEntity): Long

    @Query("SELECT * FROM tamper_events WHERE synced = 0 ORDER BY occurredAt ASC")
    suspend fun getUnsynced(): List<TamperEventEntity>

    @Query("UPDATE tamper_events SET synced = 1 WHERE id = :id")
    suspend fun markSynced(id: Long)

    @Query("DELETE FROM tamper_events WHERE synced = 1")
    suspend fun deleteSynced()
}
