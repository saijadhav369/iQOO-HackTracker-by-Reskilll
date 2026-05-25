package com.reskill.hacktracker.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import com.reskill.hacktracker.data.local.dao.AppUsageDao
import com.reskill.hacktracker.data.local.dao.CrashLogDao
import com.reskill.hacktracker.data.local.dao.EventBatchDao
import com.reskill.hacktracker.data.local.dao.SensorAggregateDao
import com.reskill.hacktracker.data.local.dao.TamperEventDao
import com.reskill.hacktracker.data.local.entity.AppUsageEntity
import com.reskill.hacktracker.data.local.entity.CrashLogEntity
import com.reskill.hacktracker.data.local.entity.EventBatchEntity
import com.reskill.hacktracker.data.local.entity.SensorAggregateEntity
import com.reskill.hacktracker.data.local.entity.TamperEventEntity

@Database(
    entities = [
        EventBatchEntity::class,
        AppUsageEntity::class,
        SensorAggregateEntity::class,
        CrashLogEntity::class,
        TamperEventEntity::class,
    ],
    version = 7,
    exportSchema = false
)
abstract class HackTrackerDatabase : RoomDatabase() {
    abstract fun eventBatchDao(): EventBatchDao
    abstract fun appUsageDao(): AppUsageDao
    abstract fun sensorAggregateDao(): SensorAggregateDao
    abstract fun crashLogDao(): CrashLogDao
    abstract fun tamperEventDao(): TamperEventDao

    companion object {
        @Volatile
        private var INSTANCE: HackTrackerDatabase? = null

        fun getInstance(context: Context): HackTrackerDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    HackTrackerDatabase::class.java,
                    "hacktracker.db"
                )
                    .fallbackToDestructiveMigration()
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
