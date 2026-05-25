package com.reskill.hacktracker.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import com.reskill.hacktracker.data.local.entity.SensorAggregateEntity

@Dao
interface SensorAggregateDao {
    @Insert
    suspend fun insert(aggregate: SensorAggregateEntity): Long

    @Query("SELECT * FROM sensor_aggregates WHERE synced = 0 ORDER BY periodStart ASC")
    suspend fun getUnsynced(): List<SensorAggregateEntity>

    @Query("UPDATE sensor_aggregates SET synced = 1 WHERE id = :id")
    suspend fun markSynced(id: Long)

    @Query("DELETE FROM sensor_aggregates WHERE synced = 1")
    suspend fun deleteSynced()
}
