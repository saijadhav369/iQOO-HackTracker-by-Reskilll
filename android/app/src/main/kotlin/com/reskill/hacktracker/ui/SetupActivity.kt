package com.reskill.hacktracker.ui

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.work.*
import com.reskill.hacktracker.R
import com.reskill.hacktracker.receivers.HackTrackerAdminReceiver
import com.reskill.hacktracker.services.DataSyncWorker
import com.reskill.hacktracker.services.HackTrackerAccessibilityService
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
    private lateinit var passcodeSetInput: EditText
    private lateinit var saveButton: Button
    private lateinit var stopButton: Button

    private var statusUpdateJob: Job? = null

    private val deviceAdminLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        updateUI()
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
        deviceIdText.text = "Device ID: ${session.deviceId}"

        updateUI()

        saveButton.setOnClickListener { saveAndStart() }
        stopButton.setOnClickListener { stopTracking() }
    }

    override fun onResume() {
        super.onResume()
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
            passcodeSetInput.isEnabled = false
        } else {
            saveButton.visibility = View.VISIBLE
            stopButton.visibility = View.GONE
            apiUrlInput.isEnabled = true
            hackathonIdInput.isEnabled = true
            teamIdInput.isEnabled = true
            teamNameInput.isEnabled = true
            passcodeSetInput.isEnabled = true
        }
    }

    private fun saveAndStart() {
        val apiUrl = apiUrlInput.text.toString().trim()
        val hackathonId = hackathonIdInput.text.toString().trim()
        val teamId = teamIdInput.text.toString().trim()
        val teamName = teamNameInput.text.toString().trim()
        val passcode = passcodeSetInput.text.toString().trim()

        if (apiUrl.isBlank() || hackathonId.isBlank() || teamId.isBlank() || teamName.isBlank()) {
            Toast.makeText(this, "Fill all fields", Toast.LENGTH_SHORT).show()
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
            val registered = repository.registerDevice()
            withContext(Dispatchers.Main) {
                if (!registered) {
                    Toast.makeText(this@SetupActivity, "Could not reach server — will retry in background.", Toast.LENGTH_LONG).show()
                }
                session.isTracking = true
                saveButton.isEnabled = true
                saveButton.text = "Save & Start Tracking"

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
        session.isTracking = false
        stopService(Intent(this, TrackingForegroundService::class.java))
        WorkManager.getInstance(this).cancelUniqueWork("hacktracker_sync")
        Toast.makeText(this, "Tracking stopped", Toast.LENGTH_SHORT).show()
        updateUI()
    }
}
