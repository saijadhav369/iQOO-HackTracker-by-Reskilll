package com.reskill.hacktracker.data.remote

import com.reskill.hacktracker.data.remote.dto.*
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path

interface ApiService {
    @POST("events/batch")
    suspend fun sendEventBatch(@Body batch: EventBatchDto): Response<Map<String, Any>>

    @POST("usage/snapshot")
    suspend fun sendUsageSnapshot(@Body snapshot: AppUsageSnapshotDto): Response<Map<String, Any>>

    @POST("device/heartbeat")
    suspend fun sendHeartbeat(@Body heartbeat: HeartbeatDto): Response<Map<String, Any>>

    @POST("device/register")
    suspend fun registerDevice(@Body registration: DeviceRegistrationDto): Response<Map<String, Any>>

    // Populates the team dropdown on SetupActivity. Backend returns a richer
    // object than TeamSummaryDto consumes (members, heartbeat, battery); Gson
    // ignores extra fields so this stays forward-compatible.
    @GET("hackathon/{hackathon_id}/teams")
    suspend fun listTeams(
        @Path("hackathon_id") hackathonId: String
    ): Response<List<TeamSummaryDto>>

    @POST("camera/event")
    suspend fun sendCameraEvent(@Body event: CameraEventDto): Response<Map<String, Any>>

    @POST("clipboard/event")
    suspend fun sendClipboardEvent(@Body event: ClipboardEventDto): Response<Map<String, Any>>

    @POST("sensors/batch")
    suspend fun sendSensorBatch(@Body batch: SensorBatchDto): Response<Map<String, Any>>

    @POST("crashes")
    suspend fun sendCrashLogs(@Body batch: CrashLogBatchDto): Response<Map<String, Any>>

    @POST("tamper")
    suspend fun sendTamperEvents(@Body batch: TamperBatchDto): Response<Map<String, Any>>

    @Multipart
    @POST("screenshots")
    suspend fun uploadScreenshot(
        @Part image: MultipartBody.Part,
        @Part("id") id: RequestBody,
        @Part("device_id") deviceId: RequestBody
    ): Response<Map<String, Any>>

    @Multipart
    @POST("face-photos")
    suspend fun uploadFacePhoto(
        @Part image: MultipartBody.Part,
        @Part("team_id") teamId: RequestBody,
        @Part("device_id") deviceId: RequestBody,
        @Part("hackathon_id") hackathonId: RequestBody,
        @Part("imei") imei: RequestBody,
        // Optional participant contact fields. Empty strings -> backend stores null.
        @Part("participant_name") participantName: RequestBody,
        @Part("email") email: RequestBody,
        @Part("phone") phone: RequestBody
    ): Response<Map<String, Any>>
}
