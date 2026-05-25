package com.reskill.hacktracker.util

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.util.Log
import com.reskill.hacktracker.receivers.HackTrackerAdminReceiver

/**
 * Thin wrapper over the device-owner-only DevicePolicyManager calls used by
 * Feature 10. Every method silently no-ops when the app is NOT device-owner so
 * callers don't have to guard each site, and every DPM call is wrapped in
 * try/catch because OriginOS occasionally throws even when ownership checks pass.
 */
object DeviceOwnerPolicy {

    fun isDeviceOwner(context: Context): Boolean {
        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as? DevicePolicyManager
            ?: return false
        return try {
            dpm.isDeviceOwnerApp(context.packageName)
        } catch (_: Exception) {
            false
        }
    }

    private fun admin(context: Context) =
        ComponentName(context, HackTrackerAdminReceiver::class.java)

    private fun dpm(context: Context): DevicePolicyManager? =
        context.getSystemService(Context.DEVICE_POLICY_SERVICE) as? DevicePolicyManager

    /**
     * Disable the status bar (quick-settings pull-down, notifications shade) while
     * the venue light is Red, restore it on Green. Device-owner only.
     */
    fun setStatusBarDisabled(context: Context, disabled: Boolean) {
        if (!isDeviceOwner(context)) return
        try {
            dpm(context)?.setStatusBarDisabled(admin(context), disabled)
        } catch (e: Exception) {
            Log.w("HackTracker", "setStatusBarDisabled($disabled) failed", e)
        }
    }

    /**
     * Whitelist our package for lock-task (kiosk) mode. This is the device-owner
     * capability that makes a *non-escapable* pin possible during sensitive
     * operations. Actually entering the pinned state requires an Activity
     * (Activity.startLockTask); from a service we can only ensure the whitelist
     * is in place. No-op when not device-owner.
     */
    fun ensureLockTaskWhitelist(context: Context) {
        if (!isDeviceOwner(context)) return
        try {
            dpm(context)?.setLockTaskPackages(admin(context), arrayOf(context.packageName))
        } catch (e: Exception) {
            Log.w("HackTracker", "setLockTaskPackages failed", e)
        }
    }
}
