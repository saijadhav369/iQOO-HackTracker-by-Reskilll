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
                // Only the timestamp — KEEP failed_attempts so the next failure
                // escalates the lockout further (exponential backoff). Counter
                // only resets via clearLockout() on a successful unlock.
                prefs.edit().remove("lockout_until").apply()
                return false
            }
            return true
        }

    val lockoutRemainingMs: Long
        get() {
            val until = prefs.getLong("lockout_until", 0)
            return (until - System.currentTimeMillis()).coerceAtLeast(0L)
        }

    var failedAttempts: Int
        get() = prefs.getInt("failed_attempts", 0)
        private set(value) = prefs.edit().putInt("failed_attempts", value).apply()

    /**
     * Records one failed unlock attempt and, past the 3-try threshold, starts
     * an exponentially-doubling lockout: attempt 3 → 5 min, 4 → 10, 5 → 20,
     * 6 → 40, 7+ → 60 (cap). Returns the lockout duration in ms (0 if no
     * lockout was triggered this call).
     */
    fun recordFailedAttempt(): Long {
        val attempts = failedAttempts + 1
        failedAttempts = attempts
        if (attempts < 3) return 0L
        val exp = (attempts - 3).coerceAtMost(4)
        val lockoutMs = ((5L * 60_000L) shl exp).coerceAtMost(60L * 60_000L)
        prefs.edit()
            .putLong("lockout_until", System.currentTimeMillis() + lockoutMs)
            .apply()
        return lockoutMs
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
