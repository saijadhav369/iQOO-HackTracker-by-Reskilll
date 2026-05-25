package com.reskill.hacktracker.services

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.reskill.hacktracker.data.repository.TrackingRepository

class DataSyncWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        return try {
            val repository = TrackingRepository(applicationContext)
            repository.syncEventBatches()
            repository.syncAppUsage()
            repository.syncCrashLogs()
            Result.success()
        } catch (_: Exception) {
            Result.retry()
        }
    }
}
