package com.reskill.hacktracker.receivers

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import com.reskill.hacktracker.ui.PasscodeActivity

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
}
