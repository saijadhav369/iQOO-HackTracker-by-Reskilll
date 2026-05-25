package com.reskill.hacktracker.ui

import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.provider.Settings
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import com.reskill.hacktracker.util.Constants

/**
 * Thin coloured strip overlay shown along the top of the screen as a venue cue.
 * Only displayed when the current light is RED. Has no effect on phone usage.
 */
class LightStateOverlay(private val context: Context) {

    private val windowManager: WindowManager =
        context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    private var view: View? = null

    fun canDraw(): Boolean = Settings.canDrawOverlays(context)

    fun isShown(): Boolean = view != null

    fun show() {
        if (view != null) return
        if (!canDraw()) {
            Log.w("HackTracker", "LightStateOverlay: SYSTEM_ALERT_WINDOW not granted")
            return
        }

        val density = context.resources.displayMetrics.density
        val heightPx = (Constants.LIGHT_OVERLAY_HEIGHT_DP * density).toInt().coerceAtLeast(1)

        val strip = View(context).apply { setBackgroundColor(Color.parseColor("#DC2626")) } // red-600

        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_SYSTEM_ALERT
        }

        // TYPE_APPLICATION_OVERLAY z-orders BELOW the status bar, so without
        // these flags the strip sits just below the status bar (visible).
        // FLAG_LAYOUT_NO_LIMITS would push it under the status bar where it gets
        // hidden — don't set it.
        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            heightPx,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = 0
            y = 0
        }

        try {
            windowManager.addView(strip, params)
            view = strip
            Log.w("HackTracker", "LightStateOverlay: shown (${heightPx}px)")
        } catch (e: Exception) {
            Log.w("HackTracker", "LightStateOverlay: addView failed: ${e.message}")
        }
    }

    fun hide() {
        val v = view ?: return
        try {
            windowManager.removeView(v)
        } catch (_: Exception) {
        }
        view = null
    }
}