package com.reskill.hacktracker.ui

import android.Manifest
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import android.app.Activity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.work.*
import com.reskill.hacktracker.R
import com.reskill.hacktracker.receivers.HackTrackerAdminReceiver
import com.reskill.hacktracker.services.DataSyncWorker
import com.reskill.hacktracker.services.HackTrackerAccessibilityService
import com.reskill.hacktracker.services.MediaProjectionHolder
import com.reskill.hacktracker.services.ScreenshotCaptor
import com.reskill.hacktracker.services.TrackingForegroundService
import com.reskill.hacktracker.util.PasscodeManager
import com.reskill.hacktracker.util.SessionManager
import kotlinx.coroutines.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.concurrent.TimeUnit

class SetupActivity : AppCompatActivity() {

    private lateinit var session: SessionManager
    private lateinit var passcodeManager: PasscodeManager

    private lateinit var statusText: TextView
    private lateinit var tapCountText: TextView
    private lateinit var deviceIdText: TextView
    private lateinit var apiUrlInput: EditText
    private lateinit var hackathonIdInput: EditText
    private lateinit var teamIdInput: EditText
    private lateinit var teamNameInput: EditText
    private lateinit var memberSlotInput: EditText
    private lateinit var memberNameInput: EditText
    private lateinit var passcodeSetInput: EditText
    private lateinit var saveButton: Button
    private lateinit var stopButton: Button

    private var statusUpdateJob: Job? = null

    private val deviceAdminLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        updateUI()
    }

    // POST_NOTIFICATIONS (Android 13+) must be granted at runtime or the system
    // silently drops every notify() call — including organiser blast pushes. The
    // foreground-service notification is exempt, which is why tracking still
    // "works" while broadcasts never reach the phone.
    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (!granted) {
            Toast.makeText(
                this,
                "Notifications are off — organiser alerts won't show. Enable them in Settings.",
                Toast.LENGTH_LONG
            ).show()
        }
    }

    private val mediaProjectionLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK && result.data != null) {
            MediaProjectionHolder.setToken(result.resultCode, result.data)
            Toast.makeText(this, "Screen capture authorised", Toast.LENGTH_SHORT).show()
        } else {
            Toast.makeText(this, "Screen capture not granted", Toast.LENGTH_SHORT).show()
        }
    }

    private fun isDeviceOwner(): Boolean {
        val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as? android.app.admin.DevicePolicyManager
            ?: return false
        return dpm.isDeviceOwnerApp(packageName)
    }

    private fun maybeRequestNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val granted = ContextCompat.checkSelfPermission(
            this, Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED
        if (!granted) {
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    private fun requestMediaProjectionConsent() {
        val intent = ScreenshotCaptor.createScreenCaptureIntent(this) ?: return
        mediaProjectionLauncher.launch(intent)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_setup)

        session = SessionManager(this)
        passcodeManager = PasscodeManager(this)

        statusText = findViewById(R.id.statusText)
        tapCountText = findViewById(R.id.tapCountText)
        deviceIdText = findViewById(R.id.deviceIdText)
        apiUrlInput = findViewById(R.id.apiUrlInput)
        hackathonIdInput = findViewById(R.id.hackathonIdInput)
        teamIdInput = findViewById(R.id.teamIdInput)
        teamNameInput = findViewById(R.id.teamNameInput)
        memberSlotInput = findViewById(R.id.memberSlotInput)
        memberNameInput = findViewById(R.id.memberNameInput)
        passcodeSetInput = findViewById(R.id.passcodeSetInput)
        saveButton = findViewById(R.id.saveButton)
        stopButton = findViewById(R.id.stopButton)

        // If tracking is active and passcode is set, require passcode to open
        // But skip if passcode was verified in the last 5 minutes
        if (session.isTracking && passcodeManager.isPasscodeSet) {
            val lastVerified = getSharedPreferences("hacktracker_prefs", MODE_PRIVATE)
                .getLong("passcode_verified_at", 0)
            val fiveMinMs = 10 * 1000L // 10 seconds for testing, change to 5*60*1000L for prod
            if (System.currentTimeMillis() - lastVerified > fiveMinMs) {
                val intent = Intent(this, PasscodeActivity::class.java)
                intent.putExtra("source", "app_open")
                startActivity(intent)
            }
        }

        // Auto-restart foreground service if tracking is on but service died (e.g. after app update)
        if (session.isTracking && session.isConfigured) {
            val serviceIntent = Intent(this, TrackingForegroundService::class.java)
            startForegroundService(serviceIntent)
        }

        // Pre-fill from saved config
        apiUrlInput.setText(session.apiUrl)
        hackathonIdInput.setText(session.hackathonId)
        teamIdInput.setText(session.teamId)
        teamNameInput.setText(session.teamName)
        if (session.memberSlot in 1..99) memberSlotInput.setText(session.memberSlot.toString())
        memberNameInput.setText(session.memberName)
        deviceIdText.text = "Device ID: ${session.deviceId}"

        // Ask for POST_NOTIFICATIONS up front — without it, Android 13+ drops
        // organiser blast pushes (and the heads-up chime) on the floor.
        maybeRequestNotificationPermission()

        // Ask once for SYSTEM_ALERT_WINDOW so the red-light overlay can render.
        if (!Settings.canDrawOverlays(this)) {
            try {
                startActivity(
                    Intent(
                        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:$packageName")
                    )
                )
            } catch (_: Exception) {}
        }

        // Screen capture fallback: device-owner uses Accessibility.takeScreenshot
        // and needs no prompt. Non-DO devices need a one-time MediaProjection
        // grant — re-asked if the process restarts (Android token cannot persist).
        if (!isDeviceOwner() && !MediaProjectionHolder.hasToken()) {
            try { requestMediaProjectionConsent() } catch (_: Exception) {}
        }

        updateUI()

        saveButton.setOnClickListener { saveAndStart() }
        stopButton.setOnClickListener { stopTracking() }

        // Headless provisioning: configure + start from intent extras so a phone
        // can be set up by an ADB script or QR device-owner admin-extras bundle
        // without any manual typing. Example:
        //   am start -n com.reskill.hacktracker/.ui.SetupActivity \
        //     --es cfg_api_url https://host/api --es cfg_hackathon_id iqoo_2026 \
        //     --es cfg_team_id team_01 --es cfg_team_name "CodeCrafters" \
        //     --es cfg_passcode 123456
        maybeConfigureFromExtras()
    }

    /**
     * Pre-fill whatever cfg_* extras the launching intent carries. If all four
     * required fields (api_url, hackathon_id, team_id, team_name) are present,
     * also auto-kick saveAndStart() — same as the Save button. This split lets
     * a provisioning script populate just the boilerplate (api_url, hackathon,
     * passcode) for pre-event configuration; the organiser then types team_id
     * and team_name on the phone at handover and taps Save manually.
     *
     * No-op on a normal launcher tap (no extras) or when already tracking, so
     * it's safe to re-fire.
     */
    private fun maybeConfigureFromExtras() {
        if (session.isTracking) return
        val apiUrl = intent?.getStringExtra("cfg_api_url")
        val hackathonId = intent?.getStringExtra("cfg_hackathon_id")
        val teamId = intent?.getStringExtra("cfg_team_id")
        val teamName = intent?.getStringExtra("cfg_team_name")
        val memberSlot = intent?.getStringExtra("cfg_member_slot")
        val memberName = intent?.getStringExtra("cfg_member_name")
        val passcode = intent?.getStringExtra("cfg_passcode")

        // Bail if NO extras at all (normal launcher tap).
        if (apiUrl.isNullOrBlank() && hackathonId.isNullOrBlank()
            && teamId.isNullOrBlank() && teamName.isNullOrBlank()
            && memberSlot.isNullOrBlank() && memberName.isNullOrBlank()
            && passcode.isNullOrBlank()) return

        // Pre-fill any field that was provided. Empty/missing extras leave the
        // existing input value alone (which may already be populated from
        // SharedPreferences in onCreate).
        if (!apiUrl.isNullOrBlank()) apiUrlInput.setText(apiUrl)
        if (!hackathonId.isNullOrBlank()) hackathonIdInput.setText(hackathonId)
        if (!teamId.isNullOrBlank()) teamIdInput.setText(teamId)
        if (!teamName.isNullOrBlank()) teamNameInput.setText(teamName)
        if (!memberSlot.isNullOrBlank()) memberSlotInput.setText(memberSlot)
        if (!memberName.isNullOrBlank()) memberNameInput.setText(memberName)
        if (!passcode.isNullOrBlank()) passcodeSetInput.setText(passcode)

        // Auto-start tracking only when the full set of required fields is
        // present. With --defer-team provisioning the organiser will tap Save
        // manually after typing team_id + team_name + member info on the phone.
        if (!apiUrl.isNullOrBlank() && !hackathonId.isNullOrBlank()
            && !teamId.isNullOrBlank() && !teamName.isNullOrBlank()
            && !memberSlot.isNullOrBlank() && !memberName.isNullOrBlank()) {
            saveAndStart()
        }
    }

    override fun onResume() {
        super.onResume()
        // If the AccessibilityService isn't grabbing screenshots (non-DO install
        // or any failure mode), MediaProjection.onStop clears the consent —
        // re-prompt here so the next organiser request just works.
        if (!isDeviceOwner() && !MediaProjectionHolder.hasToken()) {
            try { requestMediaProjectionConsent() } catch (_: Exception) {}
        }
        statusUpdateJob = CoroutineScope(Dispatchers.Main).launch {
            while (isActive) {
                updateUI()
                delay(1000)
            }
        }
    }

    override fun onPause() {
        super.onPause()
        statusUpdateJob?.cancel()
    }

    private fun isDeviceAdminActive(): Boolean {
        val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val adminComponent = ComponentName(this, HackTrackerAdminReceiver::class.java)
        return dpm.isAdminActive(adminComponent)
    }

    private fun requestDeviceAdmin() {
        val adminComponent = ComponentName(this, HackTrackerAdminReceiver::class.java)
        val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
            putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent)
            putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                "Required to prevent participants from uninstalling HackTracker during the hackathon.")
        }
        deviceAdminLauncher.launch(intent)
    }

    private fun updateUI() {
        val accessibilityRunning = HackTrackerAccessibilityService.instance != null
        val tracking = session.isTracking
        val adminActive = isDeviceAdminActive()

        val statusParts = mutableListOf<String>()

        if (tracking && accessibilityRunning) {
            statusParts.add("TRACKING")
            val taps = HackTrackerAccessibilityService.instance?.totalTaps ?: 0
            val app = HackTrackerAccessibilityService.instance?.currentApp?.split(".")?.lastOrNull() ?: "—"
            tapCountText.text = "Taps: $taps | Current app: $app"
        } else if (tracking) {
            statusParts.add("Configured (enable Accessibility Service!)")
            tapCountText.text = "Settings > Accessibility > HackTracker > ON"
        } else {
            statusParts.add("Not tracking")
            tapCountText.text = "Configure and start below"
        }

        if (!adminActive) statusParts.add("Uninstall protection: OFF")

        statusText.text = "Status: ${statusParts.joinToString(" | ")}"

        // Show/hide buttons based on state
        if (tracking) {
            saveButton.visibility = View.GONE
            stopButton.visibility = View.VISIBLE
            // Disable config fields
            apiUrlInput.isEnabled = false
            hackathonIdInput.isEnabled = false
            teamIdInput.isEnabled = false
            teamNameInput.isEnabled = false
            memberSlotInput.isEnabled = false
            memberNameInput.isEnabled = false
            passcodeSetInput.isEnabled = false
        } else {
            saveButton.visibility = View.VISIBLE
            stopButton.visibility = View.GONE
            apiUrlInput.isEnabled = true
            hackathonIdInput.isEnabled = true
            teamIdInput.isEnabled = true
            teamNameInput.isEnabled = true
            memberSlotInput.isEnabled = true
            memberNameInput.isEnabled = true
            passcodeSetInput.isEnabled = true
        }
    }

    private fun saveAndStart() {
        val apiUrl = apiUrlInput.text.toString().trim()
        val hackathonId = hackathonIdInput.text.toString().trim()
        val teamId = teamIdInput.text.toString().trim()
        val teamName = teamNameInput.text.toString().trim()
        val memberSlotRaw = memberSlotInput.text.toString().trim()
        val memberName = memberNameInput.text.toString().trim()
        val passcode = passcodeSetInput.text.toString().trim()

        if (apiUrl.isBlank() || hackathonId.isBlank() || teamId.isBlank() || teamName.isBlank()
            || memberSlotRaw.isBlank() || memberName.isBlank()) {
            Toast.makeText(this, "Fill all fields", Toast.LENGTH_SHORT).show()
            return
        }

        val memberSlot = memberSlotRaw.toIntOrNull()
        if (memberSlot == null || memberSlot !in 1..99) {
            Toast.makeText(this, "Member slot must be 1, 2, 3 ...", Toast.LENGTH_SHORT).show()
            return
        }

        if (!passcodeManager.isPasscodeSet && passcode.length < 6) {
            Toast.makeText(this, "Passcode must be at least 6 digits", Toast.LENGTH_SHORT).show()
            return
        }

        // Save configuration
        session.apiUrl = apiUrl
        session.hackathonId = hackathonId
        session.teamId = teamId
        session.teamName = teamName
        session.memberSlot = memberSlot
        session.memberName = memberName

        if (passcode.isNotBlank()) {
            passcodeManager.setPasscode(passcode)
        }

        // Activate device admin if not active
        if (!isDeviceAdminActive()) {
            requestDeviceAdmin()
        }

        // Register device with backend + start tracking
        saveButton.isEnabled = false
        saveButton.text = "Starting..."
        CoroutineScope(Dispatchers.IO).launch {
            val repository = com.reskill.hacktracker.data.repository.TrackingRepository(applicationContext)
            val result = repository.registerDevice()
            withContext(Dispatchers.Main) {
                saveButton.isEnabled = true
                saveButton.text = "Save & Start Tracking"

                when (result) {
                    is com.reskill.hacktracker.data.repository.TrackingRepository.RegisterResult.SlotConflict -> {
                        // Don't flip isTracking — the participant needs to pick a
                        // different slot first or this phone will never appear on
                        // the dashboard.
                        Toast.makeText(
                            this@SetupActivity,
                            "Member slot ${result.slot} is already taken on this team. Pick a different slot and tap Save again.",
                            Toast.LENGTH_LONG
                        ).show()
                        return@withContext
                    }
                    is com.reskill.hacktracker.data.repository.TrackingRepository.RegisterResult.Failure -> {
                        Toast.makeText(
                            this@SetupActivity,
                            "Could not reach server — will retry in background.",
                            Toast.LENGTH_LONG
                        ).show()
                    }
                    is com.reskill.hacktracker.data.repository.TrackingRepository.RegisterResult.Success -> {}
                }

                session.isTracking = true

                // Start foreground service
                val serviceIntent = Intent(this@SetupActivity, TrackingForegroundService::class.java)
                startForegroundService(serviceIntent)

                // Schedule periodic sync backup
                val syncRequest = PeriodicWorkRequestBuilder<DataSyncWorker>(
                    15, TimeUnit.MINUTES
                )
                    .setConstraints(
                        Constraints.Builder()
                            .setRequiredNetworkType(NetworkType.CONNECTED)
                            .build()
                    )
                    .build()

                WorkManager.getInstance(this@SetupActivity).enqueueUniquePeriodicWork(
                    "hacktracker_sync",
                    ExistingPeriodicWorkPolicy.KEEP,
                    syncRequest
                )

                Toast.makeText(this@SetupActivity, "Tracking started!", Toast.LENGTH_SHORT).show()
                updateUI()
            }
        }
    }

    private fun stopTracking() {
        // Mark this as a clean exit so the next process start (or the server
        // status calc) doesn't classify it as a crash. Passcode-authorised
        // stop is the ONLY runtime path that flips clean_exit=true; everything
        // else relies on ShutdownReceiver catching a system broadcast.
        session.cleanExit = true
        session.isTracking = false
        stopService(Intent(this, TrackingForegroundService::class.java))
        WorkManager.getInstance(this).cancelUniqueWork("hacktracker_sync")
        Toast.makeText(this, "Tracking stopped", Toast.LENGTH_SHORT).show()
        updateUI()
    }
}
