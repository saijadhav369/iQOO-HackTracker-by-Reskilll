package com.reskill.hacktracker.services

import android.accessibilityservice.AccessibilityService
import android.app.admin.DevicePolicyManager
import android.content.Context
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import android.view.Display
import android.view.WindowManager
import com.reskill.hacktracker.util.Constants
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.withTimeoutOrNull
import java.io.ByteArrayOutputStream
import java.util.concurrent.Executors

/**
 * Capture a single PNG screenshot of the device.
 *
 * Primary path (device-owner + API 30+): AccessibilityService.takeScreenshot.
 * Fallback path: MediaProjection — requires SetupActivity to have stashed the
 * consent intent into [MediaProjectionHolder] and [TrackingForegroundService]
 * to be the foreground host (it owns the mediaProjection FGS type).
 */
object ScreenshotCaptor {
    private const val TAG = "ScreenshotCaptor"

    suspend fun capture(context: Context): ByteArray? {
        Log.w(TAG, "capture() start")
        val accessibilityResult = tryAccessibilityCapture(context)
        if (accessibilityResult != null) {
            Log.w(TAG, "capture() AS-path produced ${accessibilityResult.size} bytes")
            return accessibilityResult
        }
        val mpResult = tryMediaProjectionCapture(context)
        if (mpResult != null) {
            Log.w(TAG, "capture() MP-path produced ${mpResult.size} bytes")
        } else {
            Log.w(TAG, "capture() both paths returned null")
        }
        return mpResult
    }

    /**
     * AccessibilityService.takeScreenshot is available to ALL accessibility
     * services on API 30+, not only device-owner apps — the device-owner
     * check the original spec called for was over-restrictive and was the
     * reason a non-DO install kept falling through to the flakier MP path.
     */
    private suspend fun tryAccessibilityCapture(context: Context): ByteArray? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            Log.w(TAG, "AS-path skipped: API ${Build.VERSION.SDK_INT} < R")
            return null
        }
        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as? DevicePolicyManager
        Log.w(TAG, "AS-path: isDeviceOwner=${dpm?.isDeviceOwnerApp(context.packageName)}")
        val service = HackTrackerAccessibilityService.instance
        if (service == null) {
            Log.w(TAG, "AS-path skipped: accessibility service instance is null")
            return null
        }

        val deferred = CompletableDeferred<Bitmap?>()
        val executor = Executors.newSingleThreadExecutor()
        try {
            service.takeScreenshot(
                Display.DEFAULT_DISPLAY,
                executor,
                object : AccessibilityService.TakeScreenshotCallback {
                    override fun onSuccess(screenshot: AccessibilityService.ScreenshotResult) {
                        // Hardware bitmaps share memory with the HardwareBuffer. We must
                        // copy to a software ARGB_8888 bitmap BEFORE closing the buffer,
                        // otherwise compress() reads from freed memory and silently
                        // returns null pixels (the bug that produced the empty tiles).
                        val swBitmap: Bitmap? = try {
                            val hwBitmap = Bitmap.wrapHardwareBuffer(
                                screenshot.hardwareBuffer,
                                screenshot.colorSpace
                            )
                            hwBitmap?.copy(Bitmap.Config.ARGB_8888, false)
                        } catch (e: Exception) {
                            Log.w(TAG, "wrapHardwareBuffer/copy failed", e)
                            null
                        }
                        try { screenshot.hardwareBuffer.close() } catch (_: Exception) {}
                        deferred.complete(swBitmap)
                    }

                    override fun onFailure(errorCode: Int) {
                        Log.w(TAG, "AccessibilityService.takeScreenshot failed: $errorCode")
                        deferred.complete(null)
                    }
                }
            )
        } catch (e: Exception) {
            Log.w(TAG, "takeScreenshot threw", e)
            executor.shutdown()
            return null
        }

        val bitmap = withTimeoutOrNull(Constants.SCREENSHOT_CAPTURE_TIMEOUT_MS) { deferred.await() }
        executor.shutdown()
        if (bitmap == null) {
            Log.w(TAG, "DO-path: bitmap is null after capture")
            return null
        }
        val bytes = bitmap.toPngBytes()
        bitmap.recycle()
        return bytes
    }

    private suspend fun tryMediaProjectionCapture(context: Context): ByteArray? {
        if (!MediaProjectionHolder.hasToken()) return null
        val service = TrackingForegroundService.instance ?: return null
        // Service owns FGS type=mediaProjection; only it may call getMediaProjection on API 34+.
        val projection = service.ensureMediaProjection() ?: return null
        return captureOneFrame(context, projection)
    }

    private suspend fun captureOneFrame(
        context: Context,
        projection: MediaProjection
    ): ByteArray? {
        val (width, height, density) = displayDimensions(context)
        if (width <= 0 || height <= 0) return null

        val deferred = CompletableDeferred<ByteArray?>()
        val handlerThread = HandlerThread("HT-mp-capture").apply { start() }
        val handler = Handler(handlerThread.looper)
        val imageReader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2)
        var virtualDisplay: VirtualDisplay? = null

        fun finish(bytes: ByteArray?) {
            if (deferred.isCompleted) return
            deferred.complete(bytes)
            try { virtualDisplay?.release() } catch (_: Exception) {}
            try { imageReader.close() } catch (_: Exception) {}
            handler.post { handlerThread.quitSafely() }
        }

        imageReader.setOnImageAvailableListener({ reader ->
            if (deferred.isCompleted) return@setOnImageAvailableListener
            val image = try { reader.acquireLatestImage() } catch (_: Exception) { null }
                ?: return@setOnImageAvailableListener
            try {
                val planes = image.planes
                val buffer = planes[0].buffer
                val pixelStride = planes[0].pixelStride
                val rowStride = planes[0].rowStride
                val rowPadding = rowStride - pixelStride * width
                val padded = Bitmap.createBitmap(
                    width + rowPadding / pixelStride,
                    height,
                    Bitmap.Config.ARGB_8888
                )
                padded.copyPixelsFromBuffer(buffer)
                val cropped = Bitmap.createBitmap(padded, 0, 0, width, height)
                val bytes = cropped.toPngBytes()
                padded.recycle()
                cropped.recycle()
                finish(bytes)
            } catch (e: Exception) {
                Log.w(TAG, "MP frame copy failed", e)
                finish(null)
            } finally {
                try { image.close() } catch (_: Exception) {}
            }
        }, handler)

        try {
            virtualDisplay = projection.createVirtualDisplay(
                "HT-capture",
                width,
                height,
                density,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                imageReader.surface,
                null,
                handler
            )
        } catch (e: Exception) {
            Log.w(TAG, "createVirtualDisplay failed", e)
            finish(null)
            return deferred.await()
        }

        return withTimeoutOrNull(Constants.SCREENSHOT_CAPTURE_TIMEOUT_MS) { deferred.await() }
            ?.also { } ?: run { finish(null); null }
    }

    private fun displayDimensions(context: Context): Triple<Int, Int, Int> {
        val wm = context.getSystemService(Context.WINDOW_SERVICE) as? WindowManager
            ?: return Triple(0, 0, 0)
        val density = context.resources.configuration.densityDpi
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val bounds = wm.currentWindowMetrics.bounds
            Triple(bounds.width(), bounds.height(), density)
        } else {
            @Suppress("DEPRECATION")
            val display = wm.defaultDisplay
            @Suppress("DEPRECATION")
            val metrics = android.util.DisplayMetrics().also { display.getRealMetrics(it) }
            Triple(metrics.widthPixels, metrics.heightPixels, metrics.densityDpi)
        }
    }

    private fun Bitmap.toPngBytes(): ByteArray {
        val bos = ByteArrayOutputStream()
        compress(Bitmap.CompressFormat.PNG, 100, bos)
        return bos.toByteArray()
    }

    /** Used by SetupActivity to obtain a [MediaProjectionManager] consent intent. */
    fun createScreenCaptureIntent(context: Context): android.content.Intent? {
        val mpm = context.getSystemService(Context.MEDIA_PROJECTION_SERVICE)
            as? MediaProjectionManager ?: return null
        return mpm.createScreenCaptureIntent()
    }
}
