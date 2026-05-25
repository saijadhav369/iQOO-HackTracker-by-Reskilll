package com.reskill.hacktracker.services

import android.content.Intent
import android.media.projection.MediaProjection

/**
 * Process-scoped holder for the MediaProjection consent intent + active projection.
 *
 * The Android MediaProjection token cannot be persisted across process death — the
 * organiser will be re-prompted from SetupActivity if the app is killed. iQOO units
 * are provisioned as device-owner so this fallback path is rare.
 */
object MediaProjectionHolder {
    @Volatile
    var resultCode: Int = 0
        private set

    @Volatile
    var resultData: Intent? = null
        private set

    @Volatile
    var projection: MediaProjection? = null

    /** Called from SetupActivity after the system consent dialog resolves. */
    fun setToken(code: Int, data: Intent?) {
        resultCode = code
        resultData = data
        // Force re-creation of MediaProjection from the new token next time.
        projection?.stop()
        projection = null
    }

    /** True if we have a consent intent we can hand back to MediaProjectionManager. */
    fun hasToken(): Boolean = resultData != null

    fun clear() {
        projection?.stop()
        projection = null
        resultData = null
        resultCode = 0
    }
}
