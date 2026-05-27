package com.reskill.hacktracker.ui

import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.reskill.hacktracker.R
import com.reskill.hacktracker.services.HackTrackerAccessibilityService
import com.reskill.hacktracker.util.PasscodeManager
import com.reskill.hacktracker.util.SessionManager

class PasscodeActivity : AppCompatActivity() {

    private lateinit var passcodeManager: PasscodeManager
    private lateinit var session: SessionManager
    private lateinit var passcodeInput: EditText
    private lateinit var errorText: TextView
    private lateinit var verifyButton: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_passcode)

        passcodeManager = PasscodeManager(this)
        session = SessionManager(this)
        passcodeInput = findViewById(R.id.passcodeInput)
        errorText = findViewById(R.id.errorText)
        verifyButton = findViewById(R.id.verifyButton)

        // Safe-mode lockout: our services are disabled while booted into Safe
        // Mode, so refuse to unlock until the organiser reboots the device out
        // of it. The flag is cleared by HackTrackerApp on the next normal boot.
        if (session.bootSafeMode) {
            showError("Device is in Safe Mode. Reboot the phone to unlock HackTracker.")
            verifyButton.isEnabled = false
            return
        }

        if (passcodeManager.isLockedOut) {
            val minutes = ((passcodeManager.lockoutRemainingMs + 59_999L) / 60_000L).toInt()
            showError("Too many attempts. Locked for $minutes more minute${if (minutes == 1) "" else "s"}.")
            verifyButton.isEnabled = false
        }

        verifyButton.setOnClickListener {
            val code = passcodeInput.text.toString()

            if (passcodeManager.isLockedOut) {
                showError("Locked out. Try again later.")
                return@setOnClickListener
            }

            if (code.isBlank()) {
                showError("Enter passcode")
                return@setOnClickListener
            }

            if (passcodeManager.verify(code)) {
                passcodeManager.clearLockout()

                // Grant 5-minute bypass for Settings access
                HackTrackerAccessibilityService.instance?.let {
                    it.passcodeBypassUntil = System.currentTimeMillis() +
                        HackTrackerAccessibilityService.PASSCODE_BYPASS_DURATION_MS
                }

                // Mark passcode as verified so SetupActivity won't re-ask
                getSharedPreferences("hacktracker_prefs", MODE_PRIVATE)
                    .edit()
                    .putLong("passcode_verified_at", System.currentTimeMillis())
                    .apply()

                val source = intent.getStringExtra("source")
                if (source == "tamper_detection" || source == "app_open") {
                    // Just go back to where we came from
                    finish()
                } else {
                    val intent = android.content.Intent(this, SetupActivity::class.java)
                    startActivity(intent)
                    finish()
                }
            } else {
                val lockoutMs = passcodeManager.recordFailedAttempt()
                val remaining = 3 - passcodeManager.failedAttempts
                if (remaining > 0) {
                    showError("Wrong passcode. $remaining attempts remaining.")
                } else {
                    val minutes = ((lockoutMs + 59_999L) / 60_000L).toInt()
                    showError("Too many attempts. Locked for $minutes minute${if (minutes == 1) "" else "s"}.")
                    verifyButton.isEnabled = false
                }
                passcodeInput.text.clear()
            }
        }
    }

    private fun showError(msg: String) {
        errorText.text = msg
        errorText.visibility = View.VISIBLE
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        // Send to home screen instead of back (prevent bypassing)
        val home = android.content.Intent(android.content.Intent.ACTION_MAIN)
        home.addCategory(android.content.Intent.CATEGORY_HOME)
        home.flags = android.content.Intent.FLAG_ACTIVITY_NEW_TASK
        startActivity(home)
    }
}
