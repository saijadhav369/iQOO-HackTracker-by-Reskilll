package com.reskill.hacktracker.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import com.reskill.hacktracker.data.local.entity.CrashLogEntity

@Dao
interface CrashLogDao {
    @Insert
    suspend fun insert(entity: CrashLogEntity): Long

    // Synchronous insert used by the uncaught-exception handler. The process is
    // about to die so we cannot suspend / await a coroutine.
    @Insert
    fun insertBlocking(entity: CrashLogEntity): Long

    @Query("SELECT * FROM crash_logs WHERE synced = 0 ORDER BY occurredAt ASC")
    suspend fun getUnsynced(): List<CrashLogEntity>

    @Query("UPDATE crash_logs SET synced = 1 WHERE id = :id")
    suspend fun markSynced(id: Long)

    @Query("DELETE FROM crash_logs WHERE synced = 1")
    suspend fun deleteSynced()
}
