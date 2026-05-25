package com.reskill.hacktracker.receivers

import android.Manifest
import android.app.admin.DeviceAdminReceiver
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.reskill.hacktracker.ui.PasscodeActivity
import com.reskill.hacktracker.ui.SetupActivity

class HackTrackerAdminReceiver : DeviceAdminReceiver() {

    override fun onDisableRequested(context: Context, intent: Intent): CharSequence {
        // Launch passcode challenge when someone tries to deactivate admin
        val challengeIntent = Intent(context, PasscodeActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        context.startActivity(challengeIntent)
        return "Organiser passcode required to disable HackTracker."
    }

    override fun onEnabled(context: Context, intent: Intent) {
        // Device admin activated
    }

    override fun onDisabled(context: Context, intent: Intent) {
        // Device admin deactivated
    }

    /**
     * Fired after QR / NFC device-owner provisioning completes. The QR's
     * PROVISIONING_ADMIN_EXTRAS_BUNDLE arrives here; we read the hackathon
     * config out of it, silently grant the notification runtime permission
     * (we're device-owner now), and hand off to SetupActivity with cfg_*
     * extras — which runs the normal configure-and-start path.
     *
     * Note: Accessibility and Usage Access still require WRITE_SECURE_SETTINGS
     * (ADB-only), so finish those via the provisioning script or one manual tap.
     */
    override fun onProfileProvisioningComplete(context: Context, intent: Intent) {
        val key = DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE
        val extras: android.os.PersistableBundle? =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                intent.getParcelableExtra(key, android.os.PersistableBundle::class.java)
            } else {
                @Suppress("DEPRECATION")
                intent.getParcelableExtra(key)
            }

        // Silently grant POST_NOTIFICATIONS via device-owner powers.
        try {
            val dpm = context.getSystemService(DevicePolicyManager::class.java)
            val admin = ComponentName(context, HackTrackerAdminReceiver::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                dpm != null && dpm.isDeviceOwnerApp(context.packageName)
            ) {
                dpm.setPermissionGrantState(
                    admin,
                    context.packageName,
                    Manifest.permission.POST_NOTIFICATIONS,
                    DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED
                )
            }
        } catch (e: Exception) {
            Log.w("HackTracker", "DO permission grant failed", e)
        }

        // Hand the config to SetupActivity, which configures + starts tracking.
        val apiUrl = extras?.getString("cfg_api_url")
        val hackathonId = extras?.getString("cfg_hackathon_id")
        val teamId = extras?.getString("cfg_team_id")
        val teamName = extras?.getString("cfg_team_name")
        val passcode = extras?.getString("cfg_passcode")

        val launch = Intent(context, SetupActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            if (apiUrl != null) putExtra("cfg_api_url", apiUrl)
            if (hackathonId != null) putExtra("cfg_hackathon_id", hackathonId)
            if (teamId != null) putExtra("cfg_team_id", teamId)
            if (teamName != null) putExtra("cfg_team_name", teamName)
            if (passcode != null) putExtra("cfg_passcode", passcode)
        }
        try {
            context.startActivity(launch)
        } catch (e: Exception) {
            Log.w("HackTracker", "post-provision SetupActivity launch failed", e)
        }
    }
}
