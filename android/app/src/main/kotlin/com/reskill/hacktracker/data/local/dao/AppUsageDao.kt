package com.reskill.hacktracker.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import com.reskill.hacktracker.data.local.entity.AppUsageEntity

@Dao
interface AppUsageDao {
    @Insert
    suspend fun insertAll(entries: List<AppUsageEntity>)

    @Query("SELECT * FROM app_usage WHERE synced = 0 ORDER BY snapshotTime ASC")
    suspend fun getUnsynced(): List<AppUsageEntity>

    @Query("UPDATE app_usage SET synced = 1 WHERE id IN (:ids)")
    suspend fun markSynced(ids: List<Long>)

    @Query("DELETE FROM app_usage WHERE synced = 1")
    suspend fun deleteSynced()
}
