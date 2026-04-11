package com.reskill.hacktracker.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import com.reskill.hacktracker.data.local.dao.AppUsageDao
import com.reskill.hacktracker.data.local.dao.EventBatchDao
import com.reskill.hacktracker.data.local.entity.AppUsageEntity
import com.reskill.hacktracker.data.local.entity.EventBatchEntity

@Database(
    entities = [EventBatchEntity::class, AppUsageEntity::class],
    version = 2,
    exportSchema = false
)
abstract class HackTrackerDatabase : RoomDatabase() {
    abstract fun eventBatchDao(): EventBatchDao
    abstract fun appUsageDao(): AppUsageDao

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
