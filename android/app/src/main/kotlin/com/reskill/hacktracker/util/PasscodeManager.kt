package com.reskill.hacktracker.util

import android.content.Context
import java.security.MessageDigest

class PasscodeManager(context: Context) {
    private val prefs = context.getSharedPreferences(Constants.PREFS_NAME, Context.MODE_PRIVATE)

    val isPasscodeSet: Boolean
        get() = prefs.getString("passcode_hash", null) != null

    fun setPasscode(passcode: String) {
        prefs.edit().putString("passcode_hash", hash(passcode)).apply()
    }

    fun verify(passcode: String): Boolean {
        val stored = prefs.getString("passcode_hash", null) ?: return false
        return hash(passcode) == stored
    }

    val isLockedOut: Boolean
        get() {
            val lockUntil = prefs.getLong("lockout_until", 0)
            if (lockUntil == 0L) return false
            if (System.currentTimeMillis() > lockUntil) {
                clearLockout()
                return false
            }
            return true
        }

    var failedAttempts: Int
        get() = prefs.getInt("failed_attempts", 0)
        private set(value) = prefs.edit().putInt("failed_attempts", value).apply()

    fun recordFailedAttempt() {
        val attempts = failedAttempts + 1
        failedAttempts = attempts
        if (attempts >= 3) {
            prefs.edit()
                .putLong("lockout_until", System.currentTimeMillis() + 5 * 60 * 1000)
                .apply()
        }
    }

    fun clearLockout() {
        prefs.edit()
            .remove("lockout_until")
            .putInt("failed_attempts", 0)
            .apply()
    }

    private fun hash(input: String): String {
        val bytes = MessageDigest.getInstance("SHA-256").digest(input.toByteArray())
        return bytes.joinToString("") { "%02x".format(it) }
    }
}
