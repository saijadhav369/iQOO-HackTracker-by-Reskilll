package com.reskill.hacktracker.util

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.UserManager
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
     * Apply the full tamper-resistant lockdown. Idempotent — safe to call on
     * every app launch, every reboot, every accessibility-service reconnect.
     *
     * What this actually does on a device-owner provisioned phone:
     *  - setUninstallBlocked(our package, true) — the system blocks `adb shell
     *    pm uninstall` AND the "Uninstall" button in Settings → Apps.
     *  - DISALLOW_APPS_CONTROL — the user cannot force-stop, clear-data, or
     *    disable any app via Settings; Settings shows the buttons greyed with
     *    "Blocked by your IT admin". This is what stops the
     *    "go-to-Apps-and-disable-HackTracker" workaround.
     *  - DISALLOW_UNINSTALL_APPS — global "no uninstalls at all". Belt &
     *    braces alongside setUninstallBlocked.
     *  - setPermittedAccessibilityServices(only our service) — the system
     *    Accessibility settings page disables the OFF toggle for our service
     *    and refuses to expose any other a11y service. The user can navigate
     *    to the page but cannot actually flip ours off.
     *
     * Returns true if every call succeeded; the boolean is useful for tests
     * but production callers should just treat this as fire-and-forget.
     */
    fun applyTamperLockdown(context: Context): Boolean {
        if (!isDeviceOwner(context)) return false
        val dpm = dpm(context) ?: return false
        val admin = admin(context)
        val pkg = context.packageName
        var ok = true

        try {
            dpm.setUninstallBlocked(admin, pkg, true)
        } catch (e: Exception) {
            Log.w("HackTracker", "setUninstallBlocked failed", e); ok = false
        }
        try {
            dpm.addUserRestriction(admin, UserManager.DISALLOW_APPS_CONTROL)
        } catch (e: Exception) {
            Log.w("HackTracker", "DISALLOW_APPS_CONTROL failed", e); ok = false
        }
        try {
            dpm.addUserRestriction(admin, UserManager.DISALLOW_UNINSTALL_APPS)
        } catch (e: Exception) {
            Log.w("HackTracker", "DISALLOW_UNINSTALL_APPS failed", e); ok = false
        }
        try {
            dpm.setPermittedAccessibilityServices(admin, listOf(pkg))
        } catch (e: Exception) {
            Log.w("HackTracker", "setPermittedAccessibilityServices failed", e); ok = false
        }
        return ok
    }

    /**
     * Release every policy applied by applyTamperLockdown. Intended for an
     * organiser-blessed "decommission" path (not currently surfaced in the
     * UI). Kept here for symmetry — if we ever need to take the phone out of
     * tracking we don't want it to stay permanently locked.
     */
    fun releaseTamperLockdown(context: Context) {
        if (!isDeviceOwner(context)) return
        val dpm = dpm(context) ?: return
        val admin = admin(context)
        val pkg = context.packageName
        try { dpm.setUninstallBlocked(admin, pkg, false) } catch (_: Exception) {}
        try { dpm.clearUserRestriction(admin, UserManager.DISALLOW_APPS_CONTROL) } catch (_: Exception) {}
        try { dpm.clearUserRestriction(admin, UserManager.DISALLOW_UNINSTALL_APPS) } catch (_: Exception) {}
        try { dpm.setPermittedAccessibilityServices(admin, null) } catch (_: Exception) {}
    }

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
