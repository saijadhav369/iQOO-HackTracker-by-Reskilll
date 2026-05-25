package com.reskill.hacktracker.services

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import com.reskill.hacktracker.data.local.entity.SensorAggregateEntity
import com.reskill.hacktracker.data.repository.TrackingRepository
import com.reskill.hacktracker.util.Constants
import com.reskill.hacktracker.util.SessionManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlin.math.sqrt

/**
 * Subscribes to motion / environment sensors at SENSOR_DELAY_NORMAL, aggregates
 * per [Constants.SENSOR_WINDOW_MS] window and persists one row per window via
 * the repository. Lifetime is bound to the parent service — call [stop] in
 * onDestroy.
 *
 * Accel/gyro values are magnitudes with gravity removed for accel
 * (sqrt(x²+y²+z²) - 9.81), so an idle phone gives stddev ≈ 0.
 */
class SensorTracker(
    context: Context,
    private val repository: TrackingRepository,
    private val session: SessionManager
) : SensorEventListener {

    private val appContext = context.applicationContext
    private val sensorManager =
        appContext.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var flushJob: Job? = null

    // Running window state — guarded by [lock] since sensor events arrive on
    // the SensorManager handler thread while the flush loop reads on IO.
    private val lock = Any()
    private var windowStart: Long = 0L
    private val accel = SeriesAccumulator()
    private val gyro = SeriesAccumulator()
    private val magneto = SeriesAccumulator()
    private val lux = SeriesAccumulator()
    private var proximityNearSamples = 0
    private var proximityTotalSamples = 0
    private var proximityMaxRange: Float = 0f
    private var stepsBaseline: Long = -1L
    private var stepsLatest: Long = -1L

    fun start() {
        if (sensorManager == null) return
        synchronized(lock) {
            resetWindow(System.currentTimeMillis())
        }
        // Register what's available; missing sensors are silently skipped.
        registerIfPresent(Sensor.TYPE_ACCELEROMETER)
        registerIfPresent(Sensor.TYPE_GYROSCOPE)
        registerIfPresent(Sensor.TYPE_MAGNETIC_FIELD)
        registerIfPresent(Sensor.TYPE_LIGHT)
        registerIfPresent(Sensor.TYPE_PROXIMITY)?.let { sensor ->
            proximityMaxRange = sensor.maximumRange
        }
        registerIfPresent(Sensor.TYPE_STEP_COUNTER)

        flushJob = scope.launch {
            while (isActive) {
                delay(Constants.SENSOR_WINDOW_MS)
                flushWindow()
            }
        }
    }

    fun stop() {
        flushJob?.cancel()
        sensorManager?.unregisterListener(this)
        scope.cancel()
    }

    private fun registerIfPresent(type: Int): Sensor? {
        val sensor = sensorManager?.getDefaultSensor(type) ?: return null
        sensorManager.registerListener(this, sensor, SensorManager.SENSOR_DELAY_NORMAL)
        return sensor
    }

    override fun onSensorChanged(event: SensorEvent) {
        when (event.sensor.type) {
            Sensor.TYPE_ACCELEROMETER -> synchronized(lock) {
                val mag = magnitude(event.values)
                // Remove ~1g so a still phone reads near zero. Negative values
                // (free-fall) get clamped — they're noise for our use case.
                accel.add((mag - SensorManager.GRAVITY_EARTH).coerceAtLeast(0f))
            }
            Sensor.TYPE_GYROSCOPE -> synchronized(lock) {
                gyro.add(magnitude(event.values))
            }
            Sensor.TYPE_MAGNETIC_FIELD -> synchronized(lock) {
                magneto.add(magnitude(event.values))
            }
            Sensor.TYPE_LIGHT -> synchronized(lock) {
                lux.add(event.values.getOrNull(0) ?: return@synchronized)
            }
            Sensor.TYPE_PROXIMITY -> synchronized(lock) {
                val v = event.values.getOrNull(0) ?: return@synchronized
                proximityTotalSamples++
                // Many sensors report 0 or maxRange only; treat anything below
                // maxRange (with small epsilon) as "near".
                if (v < proximityMaxRange - 0.01f) proximityNearSamples++
            }
            Sensor.TYPE_STEP_COUNTER -> synchronized(lock) {
                val steps = event.values.getOrNull(0)?.toLong() ?: return@synchronized
                if (stepsBaseline < 0) stepsBaseline = steps
                stepsLatest = steps
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    private suspend fun flushWindow() {
        if (!session.isConfigured) {
            // Reset so we don't carry stale samples across configuration.
            synchronized(lock) { resetWindow(System.currentTimeMillis()) }
            return
        }

        val snapshot: SensorAggregateEntity? = synchronized(lock) {
            val now = System.currentTimeMillis()
            val start = windowStart
            // Drop windows with no samples at all — saves DB churn when the
            // device has every sensor turned off.
            val anySamples = accel.count > 0 || gyro.count > 0 ||
                magneto.count > 0 || lux.count > 0 ||
                proximityTotalSamples > 0 || stepsLatest >= 0
            if (!anySamples) {
                resetWindow(now)
                return@synchronized null
            }

            val proxPct = if (proximityTotalSamples > 0) {
                proximityNearSamples.toFloat() / proximityTotalSamples * 100f
            } else null

            val stepsDelta = if (stepsBaseline >= 0 && stepsLatest >= stepsBaseline) {
                (stepsLatest - stepsBaseline).toInt()
            } else null

            val entity = SensorAggregateEntity(
                hackathonId = session.hackathonId,
                teamId = session.teamId,
                deviceId = session.deviceId,
                periodStart = start,
                periodEnd = now,
                accelMean = accel.meanOrNull(),
                accelStddev = accel.stddevOrNull(),
                accelPeak = accel.peakOrNull(),
                gyroMean = gyro.meanOrNull(),
                gyroStddev = gyro.stddevOrNull(),
                gyroPeak = gyro.peakOrNull(),
                magnetoMean = magneto.meanOrNull(),
                luxMean = lux.meanOrNull(),
                proximityNearPct = proxPct,
                stepsDelta = stepsDelta
            )

            resetWindow(now)
            entity
        }

        if (snapshot != null) {
            try { repository.saveSensorAggregate(snapshot) } catch (_: Exception) {}
        }
    }

    private fun resetWindow(now: Long) {
        windowStart = now
        accel.reset()
        gyro.reset()
        magneto.reset()
        lux.reset()
        proximityNearSamples = 0
        proximityTotalSamples = 0
        // Carry step counter latest forward as next window's baseline.
        if (stepsLatest >= 0) stepsBaseline = stepsLatest else stepsBaseline = -1L
    }

    private fun magnitude(v: FloatArray): Float {
        if (v.size < 3) return 0f
        return sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
    }

    /**
     * Welford's online mean/variance. Keeps the per-event work to a handful of
     * floats — that's what keeps this feature under the 1.5% battery budget.
     */
    private class SeriesAccumulator {
        var count: Int = 0
            private set
        private var mean: Double = 0.0
        private var m2: Double = 0.0
        private var peak: Float = Float.NEGATIVE_INFINITY

        fun add(value: Float) {
            count++
            val delta = value - mean
            mean += delta / count
            m2 += delta * (value - mean)
            if (value > peak) peak = value
        }

        fun reset() {
            count = 0
            mean = 0.0
            m2 = 0.0
            peak = Float.NEGATIVE_INFINITY
        }

        fun meanOrNull(): Float? = if (count == 0) null else mean.toFloat()
        fun peakOrNull(): Float? = if (count == 0) null else peak
        fun stddevOrNull(): Float? {
            if (count < 2) return if (count == 1) 0f else null
            return sqrt(m2 / (count - 1)).toFloat()
        }
    }
}
